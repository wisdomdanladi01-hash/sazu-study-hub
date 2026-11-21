import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core import rate_limit
from app.db.database import Base, get_db
from app.main import app
from app import models as _models  # noqa: F401


@pytest.fixture(autouse=True)
def configure_test_settings(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setattr(settings, "jwt_secret_key", "test-only-secret-key-with-at-least-32-bytes")
    monkeypatch.setattr(settings, "private_storage_dir", str(tmp_path / "private"))
    monkeypatch.setattr(settings, "verification_document_retention_days", 3)
    # Existing tests exercise the download access rules. Students are blocked from raw downloads
    # in production by default; the viewer tests switch this back off explicitly.
    monkeypatch.setattr(settings, "student_downloads_enabled", True)
    monkeypatch.setattr(settings, "auth_rate_limit_requests", 10)
    monkeypatch.setattr(settings, "auth_rate_limit_window_seconds", 60)
    with rate_limit._lock:
        rate_limit._request_times.clear()


@pytest.fixture
def db_session() -> Session:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as session:
        yield session
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def client(db_session: Session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
