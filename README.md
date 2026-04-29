# Fuel Tracker - 油耗记录工具

一个自部署的 Web 油耗记录工具，用于跟踪每次加油的油量、单价、总价和车辆里程，自动计算油耗和费用统计。

## 功能

- **加油记录管理** - 按日期记录油量、单价、总价、里程数，支持增删改
- **智能计算** - 油量/单价/总价三选二，自动推算第三个
- **区间分析** - 自动计算两次加油之间的行驶里程、油耗 (L/100km)、每公里费用
- **全局统计** - 总行驶里程、加油总费用、总加油量、平均油耗、日均行驶里程
- **年度/月度汇总** - 独立汇总页面，按年或按月统计里程、油量、费用、油耗、日均里程
- **Excel 导入** - 批量导入 `.xlsx` 格式的历史加油记录，自动匹配列名，跳过重复数据
- **CSV 导出** - 一键导出所有记录为 CSV 文件（兼容 Excel）
- **分页显示** - 支持 10/20/30/50/100 条每页切换，记住用户偏好
- **移动端适配** - 响应式设计，适配手机和桌面浏览器

## 技术栈

| 组件 | 技术 |
|------|------|
| 后端 | Python / FastAPI |
| 数据库 | SQLite（零配置） |
| 前端 | 原生 HTML + CSS + JavaScript |
| ORM | SQLAlchemy |

## 项目结构

```
fuel-tracker/
├── main.py              # FastAPI 应用入口，所有 API 路由
├── models.py            # SQLAlchemy 数据模型
├── database.py          # 数据库连接配置
├── requirements.txt     # Python 依赖
├── .gitignore
├── static/
│   ├── index.html       # 主页（记录列表 + 统计卡片）
│   ├── app.js           # 主页逻辑
│   ├── summary.html     # 统计汇总页（年度/月度）
│   ├── summary.js       # 汇总页逻辑
│   └── style.css        # 全局样式（含响应式）
└── data/
    └── fuel.db          # SQLite 数据库文件（运行时自动生成）
```

## 快速开始

### 环境要求

- Python 3.10+

### 安装与运行

```bash
git clone <repo-url> fuel-tracker
cd fuel-tracker

# 创建并激活 Python 虚拟环境（推荐）
python3 -m venv venv
source venv/bin/activate   # Linux / macOS
# venv\Scripts\activate    # Windows

# 安装依赖
pip install -r requirements.txt

# 启动服务
uvicorn main:app --host 0.0.0.0 --port 8000
```

浏览器访问 `http://localhost:8000` 即可使用。

### 自定义数据库路径

数据库默认存放在 `data/fuel.db`，可通过环境变量自定义：

```bash
FUEL_DB_PATH=/path/to/your/fuel.db uvicorn main:app --host 0.0.0.0 --port 8000
```

## Docker 部署

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

```bash
# 构建并运行，挂载 data 目录以持久化数据
docker build -t fuel-tracker .
docker run -d -p 8000:8000 -v $(pwd)/data:/app/data fuel-tracker
```

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/records?page=1&page_size=20` | 分页获取加油记录 |
| `POST` | `/api/records` | 新增记录 |
| `PUT` | `/api/records/{id}` | 修改记录 |
| `DELETE` | `/api/records/{id}` | 删除记录 |
| `GET` | `/api/stats` | 全局统计 |
| `GET` | `/api/stats/summary?mode=yearly` | 年度/月度汇总（`yearly` 或 `monthly`） |
| `GET` | `/api/export/csv` | 导出 CSV |
| `POST` | `/api/import/xlsx` | 导入 Excel（multipart/form-data） |

启动后可访问 `http://localhost:8000/docs` 查看完整 API 文档（FastAPI 自动生成）。

## Excel 导入格式

支持的列名（自动匹配，顺序不限）：

| 列名 | 是否必须 | 说明 |
|------|----------|------|
| 加油日期 | 必须 | 格式 `YYYY-MM-DD` |
| 行驶里程 | 必须 | 当前总里程 (km) |
| 加油量 | 可选 | 升 (L) |
| 支付单价 | 可选 | 元/L |
| 支付总额 | 可选 | 元 |
| 油号 | 可选 | 如 92#，存入备注字段 |

汇总行（总记录数、平均油耗等）会自动跳过，重复记录（日期+里程相同）不会重复导入。

## License

MIT
