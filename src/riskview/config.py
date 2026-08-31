"""Application settings — the one place the database URL is defined.

Both the app and Alembic read this, so `alembic upgrade head` and the running
server can never disagree about which database they mean. Override with the
RISKVIEW_DATABASE_URL environment variable; tests point it at a temporary file.
"""

from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_DATABASE_URL = "sqlite+pysqlite:///./riskview.db"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="RISKVIEW_", env_file=".env", extra="ignore")

    database_url: str = DEFAULT_DATABASE_URL

    @field_validator("database_url")
    @classmethod
    def _absolutise_sqlite_path(cls, url: str) -> str:
        """Resolve a relative SQLite path against the working directory.

        Without this, `alembic upgrade head` from the repo root and a server
        started from anywhere else would quietly use two different files. An
        absolute URL makes the target unambiguous in logs and error messages.
        """
        prefix, separator, location = url.partition(":///")
        if not separator or not prefix.startswith("sqlite") or location in ("", ":memory:"):
            return url
        return f"{prefix}:///{Path(location).expanduser().resolve()}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
