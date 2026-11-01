import os
from typing import Any
from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = Field(default="Learning Resource Platform API")
    app_env: str = Field(
        default="production" if os.getenv("VERCEL") else "development",
        alias="APP_ENV",
    )
    debug: bool = Field(default=False, alias="DEBUG")
    api_v1_str: str = Field(default="/api/v1", alias="API_V1_STR")
    database_url: str = Field(
        default="postgresql+psycopg://postgres:postgres@localhost:5432/learning_platform_dev",
        validation_alias=AliasChoices(
            "DATABASE_URL",
            "POSTGRES_URL",
            "sazu_POSTGRES_URL",
            "sazu_DATABASE_URL",
            "sazu_POSTGRES_PRISMA_URL",
            "sazu_DATABASE_URL_UNPOOLED",
            "sazu_POSTGRES_URL_NON_POOLING",
        ),
    )

    @field_validator("database_url", mode="before")
    @classmethod
    def discover_database_url(cls, v: Any) -> Any:
        # Check explicit priority aliases
        for key in [
            "sazu_POSTGRES_URL",
            "sazu_DATABASE_URL",
            "POSTGRES_URL",
            "DATABASE_URL",
            "sazu_POSTGRES_PRISMA_URL",
            "sazu_DATABASE_URL_UNPOOLED",
            "sazu_POSTGRES_URL_NON_POOLING",
        ]:
            val = os.getenv(key)
            if val:
                return val

        # Check for any environment variable ending in _POSTGRES_URL or _DATABASE_URL
        for key, val in os.environ.items():
            if (key.endswith("_POSTGRES_URL") or key.endswith("_DATABASE_URL")) and val.startswith("postgres"):
                return val

        return v

    @field_validator("database_url", mode="after")
    @classmethod
    def normalize_database_url(cls, v: str) -> str:
        if v.startswith("postgres://"):
            return "postgresql+psycopg://" + v[len("postgres://") :]
        if v.startswith("postgresql://"):
            return "postgresql+psycopg://" + v[len("postgresql://") :]
        return v

    jwt_secret_key: str = Field(
        default="sazu-study-hub-production-jwt-fallback-key-2026-min-32-bytes",
        validation_alias=AliasChoices("JWT_SECRET_KEY", "sazu_JWT_SECRET_KEY"),
    )
    access_token_expire_minutes: int = Field(default=20, alias="ACCESS_TOKEN_EXPIRE_MINUTES")
    verification_document_retention_days: int = Field(
        default=3, alias="VERIFICATION_DOCUMENT_RETENTION_DAYS"
    )
    private_storage_dir: str = Field(default="private_storage", alias="PRIVATE_STORAGE_DIR")

    @field_validator("private_storage_dir", mode="before")
    @classmethod
    def default_serverless_storage_dir(cls, v: str | None) -> str:
        if v and v != "private_storage":
            return v
        if os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"):
            return "/tmp/private_storage"
        return v or "private_storage"
    blob_read_write_token: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "BLOB_READ_WRITE_TOKEN",
            "sazu_BLOB_READ_WRITE_TOKEN",
            "VERCEL_BLOB_TOKEN",
        ),
    )
    storage_provider: str = Field(
        default="auto",
        validation_alias=AliasChoices("STORAGE_PROVIDER", "sazu_STORAGE_PROVIDER"),
    )
    verification_document_max_bytes: int = Field(
        default=10_485_760, alias="VERIFICATION_DOCUMENT_MAX_BYTES"
    )
    resource_max_bytes: int = Field(default=52_428_800, gt=0, alias="RESOURCE_MAX_BYTES")
    paystack_secret_key: str = Field(default="", alias="PAYSTACK_SECRET_KEY")
    paystack_api_url: str = Field(
        default="https://api.paystack.co", alias="PAYSTACK_API_URL"
    )
    paystack_callback_url: str = Field(
        default="http://localhost:5173/payment/return",
        alias="PAYSTACK_CALLBACK_URL",
    )
    paystack_timeout_seconds: float = Field(
        default=10.0, gt=0, alias="PAYSTACK_TIMEOUT_SECONDS"
    )
    paystack_live_enabled: bool = Field(default=False, alias="PAYSTACK_LIVE_ENABLED")
    default_semester_subscription_price_minor: int = Field(
        default=100_000, gt=0, alias="DEFAULT_SEMESTER_SUBSCRIPTION_PRICE_MINOR"
    )
    auth_rate_limit_requests: int = Field(default=10, gt=0, alias="AUTH_RATE_LIMIT_REQUESTS")
    auth_rate_limit_window_seconds: int = Field(
        default=60, gt=0, alias="AUTH_RATE_LIMIT_WINDOW_SECONDS"
    )
    backend_cors_origins: str = Field(
        default="http://localhost:3000,http://localhost:5173",
        alias="BACKEND_CORS_ORIGINS",
    )

    @property
    def cors_origins(self) -> list[str]:
        value = self.backend_cors_origins.strip()
        if not value:
            return []
        if value.startswith("["):
            import json

            parsed = json.loads(value)
            return [str(item).strip() for item in parsed if str(item).strip()]
        return [item.strip() for item in value.split(",") if item.strip()]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )


settings = Settings()
