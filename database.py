import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

# 数据库存放在 data/ 子目录，与代码分离，避免升级时误删
# 可通过环境变量 FUEL_DB_PATH 自定义路径
_default_db_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
os.makedirs(_default_db_dir, exist_ok=True)

_default_db_path = os.path.join(_default_db_dir, "fuel.db")
DB_PATH = os.environ.get("FUEL_DB_PATH", _default_db_path)

DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
