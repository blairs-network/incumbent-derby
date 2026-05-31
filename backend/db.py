"""Database setup for Incumbent Derby.

Uses SQLAlchemy with SQLite by default.  The database URL can be set via the
environment variable ``DATABASE_URL``.  A small helper ``get_db`` yields a
session for FastAPI dependencies.
"""

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase


class Base(DeclarativeBase):
    """Base class for declarative models."""
    pass


def get_database_url() -> str:
    """Return the database URL from the environment or use a default."""
    return os.getenv("DATABASE_URL", "sqlite:///./backend/derby.db")


def get_engine():
    """Create the SQLAlchemy engine."""
    url = get_database_url()
    # For SQLite allow connections from multiple threads
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    return create_engine(url, echo=False, future=True, connect_args=connect_args)


engine = get_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def get_db():
    """FastAPI dependency that provides a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()