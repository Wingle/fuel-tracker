from collections import OrderedDict

import csv
import io
import math
from datetime import date, datetime
from typing import Optional

import openpyxl
from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, model_validator
from sqlalchemy import asc, desc, func
from sqlalchemy.orm import Session

from database import Base, engine, get_db
from models import FuelRecord

# ---------------------------------------------------------------------------
# Create tables
# ---------------------------------------------------------------------------
Base.metadata.create_all(bind=engine)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="油耗记录工具")


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------
class RecordCreate(BaseModel):
    date: date
    mileage: float
    volume: Optional[float] = None
    unit_price: Optional[float] = None
    total_price: Optional[float] = None
    note: Optional[str] = ""

    @model_validator(mode="after")
    def auto_calculate(self):
        """根据已提供的两个值自动推算第三个"""
        v, u, t = self.volume, self.unit_price, self.total_price
        count = sum(x is not None and x > 0 for x in [v, u, t])
        if count >= 2:
            if v and u and not t:
                self.total_price = round(v * u, 2)
            elif v and t and not u:
                self.unit_price = round(t / v, 2) if v else None
            elif u and t and not v:
                self.volume = round(t / u, 2) if u else None
        return self


class RecordUpdate(RecordCreate):
    pass


class RecordOut(BaseModel):
    id: int
    date: date
    mileage: float
    volume: Optional[float]
    unit_price: Optional[float]
    total_price: Optional[float]
    note: Optional[str]
    created_at: datetime
    # 计算字段
    distance: Optional[float] = None  # 区间里程
    fuel_consumption: Optional[float] = None  # L/100km
    cost_per_km: Optional[float] = None  # 元/km

    model_config = {"from_attributes": True}


class PaginatedRecords(BaseModel):
    items: list[RecordOut]
    total: int  # 总记录数
    page: int  # 当前页
    page_size: int  # 每页条数
    total_pages: int  # 总页数


class StatsOut(BaseModel):
    total_mileage: float  # 车辆总里程（仪表盘里程）
    total_cost: float  # 加油总费用
    total_volume: float  # 总加油量
    avg_consumption: Optional[float]  # 平均油耗 L/100km
    daily_mileage: Optional[float]  # 日均里程
    record_count: int  # 记录总数


# ---------------------------------------------------------------------------
# Helper: enrich records with computed interval data
# ---------------------------------------------------------------------------
def enrich_records(records: list[FuelRecord]) -> list[dict]:
    """给每条记录附加区间里程、油耗、每公里费用"""
    sorted_recs = sorted(records, key=lambda r: (r.date, r.mileage))
    result = []
    for i, rec in enumerate(sorted_recs):
        data = {
            "id": rec.id,
            "date": rec.date,
            "mileage": rec.mileage,
            "volume": rec.volume,
            "unit_price": rec.unit_price,
            "total_price": rec.total_price,
            "note": rec.note,
            "created_at": rec.created_at,
            "distance": None,
            "fuel_consumption": None,
            "cost_per_km": None,
        }
        if i > 0:
            prev = sorted_recs[i - 1]
            dist = rec.mileage - prev.mileage
            if dist > 0:
                data["distance"] = round(dist, 1)
                if rec.volume and rec.volume > 0:
                    data["fuel_consumption"] = round(rec.volume / dist * 100, 2)
                if rec.total_price and rec.total_price > 0:
                    data["cost_per_km"] = round(rec.total_price / dist, 2)
        result.append(data)
    # 返回按日期降序（新的在前）
    result.reverse()
    return result


# ---------------------------------------------------------------------------
# API Routes
# ---------------------------------------------------------------------------
@app.get("/api/records", response_model=PaginatedRecords)
def list_records(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    all_records = db.query(FuelRecord).order_by(asc(FuelRecord.date), asc(FuelRecord.mileage)).all()
    enriched = enrich_records(all_records)  # returned desc by date

    total = len(enriched)
    total_pages = max(1, math.ceil(total / page_size))
    page = min(page, total_pages)

    start = (page - 1) * page_size
    end = start + page_size
    items = enriched[start:end]

    return PaginatedRecords(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@app.post("/api/records", response_model=RecordOut)
def create_record(payload: RecordCreate, db: Session = Depends(get_db)):
    rec = FuelRecord(
        date=payload.date,
        mileage=payload.mileage,
        volume=payload.volume,
        unit_price=payload.unit_price,
        total_price=payload.total_price,
        note=payload.note,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    # re-enrich to get computed fields
    all_records = db.query(FuelRecord).all()
    enriched = enrich_records(all_records)
    for e in enriched:
        if e["id"] == rec.id:
            return e
    return rec


@app.put("/api/records/{record_id}", response_model=RecordOut)
def update_record(record_id: int, payload: RecordUpdate, db: Session = Depends(get_db)):
    rec = db.query(FuelRecord).filter(FuelRecord.id == record_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="记录不存在")
    rec.date = payload.date
    rec.mileage = payload.mileage
    rec.volume = payload.volume
    rec.unit_price = payload.unit_price
    rec.total_price = payload.total_price
    rec.note = payload.note
    db.commit()
    db.refresh(rec)
    all_records = db.query(FuelRecord).all()
    enriched = enrich_records(all_records)
    for e in enriched:
        if e["id"] == rec.id:
            return e
    return rec


@app.delete("/api/records/{record_id}")
def delete_record(record_id: int, db: Session = Depends(get_db)):
    rec = db.query(FuelRecord).filter(FuelRecord.id == record_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="记录不存在")
    db.delete(rec)
    db.commit()
    return {"ok": True}


@app.get("/api/stats", response_model=StatsOut)
def get_stats(db: Session = Depends(get_db)):
    records = db.query(FuelRecord).order_by(asc(FuelRecord.date), asc(FuelRecord.mileage)).all()
    count = len(records)
    if count == 0:
        return StatsOut(
            total_mileage=0,
            total_cost=0,
            total_volume=0,
            avg_consumption=None,
            daily_mileage=None,
            record_count=0,
        )

    first = records[0]
    last = records[-1]
    total_mileage = last.mileage  # 仪表盘里程：最新一次录入的里程数
    driven_mileage = last.mileage - first.mileage if count > 1 else 0  # 记录期间行驶里程
    total_cost = sum(r.total_price or 0 for r in records)
    total_volume_all = sum(r.volume or 0 for r in records)

    # 平均油耗: 总油量 / 行驶里程 * 100 (排除第一次，因为第一次的油量不对应可计算的区间)
    total_volume = sum(r.volume or 0 for r in records[1:]) if count > 1 else 0
    avg_consumption = round(total_volume / driven_mileage * 100, 2) if driven_mileage > 0 and total_volume > 0 else None

    # 日均里程
    days_span = (last.date - first.date).days if count > 1 else 0
    daily_mileage = round(driven_mileage / days_span, 1) if days_span > 0 else None

    return StatsOut(
        total_mileage=round(total_mileage, 1),
        total_cost=round(total_cost, 2),
        total_volume=round(total_volume_all, 2),
        avg_consumption=avg_consumption,
        daily_mileage=daily_mileage,
        record_count=count,
    )


# ---------------------------------------------------------------------------
# Period summary (yearly / monthly)
# ---------------------------------------------------------------------------
class PeriodSummaryItem(BaseModel):
    period: str  # "2025" or "2025-03"
    mileage: float  # 该期间行驶里程
    volume: float  # 该期间加油量
    cost: float  # 该期间加油费用
    avg_consumption: Optional[float]  # 平均油耗 L/100km
    daily_mileage: Optional[float]  # 日均行驶里程
    record_count: int  # 加油次数


class PeriodSummaryOut(BaseModel):
    mode: str  # "yearly" or "monthly"
    items: list[PeriodSummaryItem]


@app.get("/api/stats/summary", response_model=PeriodSummaryOut)
def get_period_summary(
    mode: str = Query("yearly", pattern="^(yearly|monthly)$"),
    db: Session = Depends(get_db),
):
    """按年度或月度汇总统计"""
    all_records = (
        db.query(FuelRecord)
        .order_by(asc(FuelRecord.date), asc(FuelRecord.mileage))
        .all()
    )
    if not all_records:
        return PeriodSummaryOut(mode=mode, items=[])

    # ---- enrich: attach distance to each record ----
    enriched: list[dict] = []
    for i, rec in enumerate(all_records):
        dist = 0.0
        if i > 0:
            dist = rec.mileage - all_records[i - 1].mileage
            if dist < 0:
                dist = 0.0
        enriched.append({
            "date": rec.date,
            "volume": rec.volume or 0,
            "total_price": rec.total_price or 0,
            "distance": dist,
            "is_first": i == 0,
        })

    # ---- group by period ----
    def period_key(d: date) -> str:
        if mode == "yearly":
            return str(d.year)
        return f"{d.year}-{d.month:02d}"

    groups: dict[str, list[dict]] = OrderedDict()
    for e in enriched:
        key = period_key(e["date"])
        groups.setdefault(key, []).append(e)

    # ---- calculate each period ----
    items: list[PeriodSummaryItem] = []
    for period, recs in groups.items():
        total_dist = sum(r["distance"] for r in recs)
        # 对于该期间的第一条，如果它是全局第一条记录则没有 distance
        total_vol = sum(r["volume"] for r in recs if not r["is_first"])
        # 如果全局第一条落在这个期间，仍然要算费用
        total_cost = sum(r["total_price"] for r in recs)
        count = len(recs)

        avg_cons = None
        if total_dist > 0 and total_vol > 0:
            avg_cons = round(total_vol / total_dist * 100, 2)

        # 日均里程: 该期间内的天数跨度
        dates = [r["date"] for r in recs]
        day_span = (max(dates) - min(dates)).days if len(dates) > 1 else 0
        daily_mi = round(total_dist / day_span, 1) if day_span > 0 else None

        items.append(PeriodSummaryItem(
            period=period,
            mileage=round(total_dist, 1),
            volume=round(total_vol, 2),
            cost=round(total_cost, 2),
            avg_consumption=avg_cons,
            daily_mileage=daily_mi,
            record_count=count,
        ))

    # 按时间倒序返回（新的在前）
    items.reverse()
    return PeriodSummaryOut(mode=mode, items=items)


@app.get("/api/export/csv")
def export_csv(db: Session = Depends(get_db)):
    records = db.query(FuelRecord).order_by(asc(FuelRecord.date), asc(FuelRecord.mileage)).all()
    enriched = enrich_records(records)
    # 按日期正序导出
    enriched.reverse()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["日期", "里程数(km)", "油量(L)", "单价(元/L)", "总价(元)", "区间里程(km)", "油耗(L/100km)", "每公里费用(元/km)", "备注"])
    for r in enriched:
        writer.writerow([
            r["date"],
            r["mileage"],
            r["volume"] or "",
            r["unit_price"] or "",
            r["total_price"] or "",
            r["distance"] or "",
            r["fuel_consumption"] or "",
            r["cost_per_km"] or "",
            r["note"] or "",
        ])

    output.seek(0)
    # Add BOM for Excel compatibility
    bom = "﻿"
    content = bom + output.getvalue()

    return StreamingResponse(
        io.BytesIO(content.encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=fuel_records.csv"},
    )


# ---------------------------------------------------------------------------
# Import from Excel (.xlsx)
# ---------------------------------------------------------------------------
class ImportResult(BaseModel):
    imported: int  # 成功导入条数
    skipped: int  # 跳过条数 (重复等)
    errors: list[str]  # 错误信息


@app.post("/api/import/xlsx", response_model=ImportResult)
async def import_xlsx(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    导入 xlsx 格式的油耗记录。
    支持的列格式（按表头自动匹配）:
      加油日期, 加油量 (L), 支付单价 (元), 支付总额 (元), 行驶里程 (km), 油号(可选)
    """
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="请上传 .xlsx 格式的文件")

    contents = await file.read()
    try:
        wb = openpyxl.load_workbook(io.BytesIO(contents), read_only=True, data_only=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"无法读取 Excel 文件: {e}")

    ws = wb[wb.sheetnames[0]]

    # ---------- Parse header to find column indexes ----------
    header_row = [str(c.value or "").strip() for c in next(ws.iter_rows(min_row=1, max_row=1))]
    col_map = {}
    HEADER_KEYWORDS = {
        "date": ["加油日期", "日期"],
        "volume": ["加油量", "油量"],
        "unit_price": ["支付单价", "单价"],
        "total_price": ["支付总额", "总价", "总额"],
        "mileage": ["行驶里程", "里程数", "里程"],
        "fuel_type": ["油号", "燃油类型"],
    }
    for idx, h in enumerate(header_row):
        for field, keywords in HEADER_KEYWORDS.items():
            if field not in col_map:
                for kw in keywords:
                    if kw in h:
                        col_map[field] = idx
                        break

    # Validate required columns
    required = ["date", "mileage"]
    missing = [f for f in required if f not in col_map]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Excel 中缺少必要的列: {', '.join(missing)}。需要至少包含「加油日期」和「行驶里程」列。"
            f" 找到的表头: {header_row}",
        )

    # ---------- Get existing mileage values to detect duplicates ----------
    existing = set()
    for rec in db.query(FuelRecord.date, FuelRecord.mileage).all():
        existing.add((str(rec.date), float(rec.mileage)))

    # ---------- Parse data rows ----------
    imported = 0
    skipped = 0
    errors: list[str] = []

    for row_idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        # Skip summary / empty rows
        first_cell = row[0] if row else None
        if first_cell is None:
            continue
        # Summary rows start with Chinese text like "总记录数", "总增加里程" etc.
        if isinstance(first_cell, str) and any(
            kw in first_cell for kw in ["总记录", "总增加", "总加油", "总支付", "平均油耗", "统计汇总", "用户ID", "weCarId"]
        ):
            continue

        try:
            # Parse date
            raw_date = row[col_map["date"]] if "date" in col_map else None
            if raw_date is None:
                continue
            if isinstance(raw_date, datetime):
                rec_date = raw_date.date()
            elif isinstance(raw_date, date):
                rec_date = raw_date
            elif isinstance(raw_date, str):
                raw_date = raw_date.strip()
                if not raw_date:
                    continue
                rec_date = datetime.strptime(raw_date, "%Y-%m-%d").date()
            else:
                errors.append(f"第 {row_idx} 行: 无法解析日期 '{raw_date}'")
                continue

            # Parse mileage
            raw_mileage = row[col_map["mileage"]] if "mileage" in col_map else None
            if raw_mileage is None:
                continue
            mileage = float(raw_mileage)

            # Duplicate check
            if (str(rec_date), mileage) in existing:
                skipped += 1
                continue

            # Parse optional fields
            volume = None
            if "volume" in col_map and row[col_map["volume"]] is not None:
                volume = float(row[col_map["volume"]])

            unit_price = None
            if "unit_price" in col_map and row[col_map["unit_price"]] is not None:
                unit_price = float(row[col_map["unit_price"]])

            total_price = None
            if "total_price" in col_map and row[col_map["total_price"]] is not None:
                total_price = float(row[col_map["total_price"]])

            note = ""
            if "fuel_type" in col_map and row[col_map["fuel_type"]] is not None:
                note = str(row[col_map["fuel_type"]]).strip()

            record = FuelRecord(
                date=rec_date,
                mileage=mileage,
                volume=volume,
                unit_price=unit_price,
                total_price=total_price,
                note=note,
            )
            db.add(record)
            existing.add((str(rec_date), mileage))
            imported += 1

        except Exception as e:
            errors.append(f"第 {row_idx} 行: {e}")

    if imported > 0:
        db.commit()

    wb.close()
    return ImportResult(imported=imported, skipped=skipped, errors=errors[:20])


# ---------------------------------------------------------------------------
# Static files (serve frontend)
# ---------------------------------------------------------------------------
app.mount("/", StaticFiles(directory="static", html=True), name="static")
