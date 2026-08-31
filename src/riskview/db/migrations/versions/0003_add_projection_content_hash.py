"""add projection content hash

projection_versions gains the canonical content hash of its cashflows, so a
re-upload can be recognised as a no-op before a phantom version is minted. The
byte SHA on ingestion_batches keeps answering "have these exact bytes been seen?";
this hash answers "did this fund's schedule actually change?". Existing rows get
an empty hash: they predate change detection, so the next upload of the same
content mints one final version and change detection starts from there.

Revision ID: 0003
Revises: 0002
Create Date: 2026-08-31

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | Sequence[str] | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("projection_versions", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("content_hash", sa.String(length=64), nullable=False, server_default="")
        )


def downgrade() -> None:
    with op.batch_alter_table("projection_versions", schema=None) as batch_op:
        batch_op.drop_column("content_hash")
