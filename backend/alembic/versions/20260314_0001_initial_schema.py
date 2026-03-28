"""initial schema

Revision ID: 20260314_0001
Revises:
Create Date: 2026-03-14 12:20:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260314_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dashboard_views",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_dashboard_views_id"), "dashboard_views", ["id"], unique=False)
    op.create_index(op.f("ix_dashboard_views_user_id"), "dashboard_views", ["user_id"], unique=False)

    op.create_table(
        "hotspot_risk_policy",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("weight_total", sa.Float(), nullable=False),
        sa.Column("weight_high", sa.Float(), nullable=False),
        sa.Column("weight_open", sa.Float(), nullable=False),
        sa.Column("medium_score_min", sa.Float(), nullable=False),
        sa.Column("high_score_min", sa.Float(), nullable=False),
        sa.Column("critical_score_min", sa.Float(), nullable=False),
        sa.Column("medium_count_min", sa.Integer(), nullable=False),
        sa.Column("high_count_min", sa.Integer(), nullable=False),
        sa.Column("critical_count_min", sa.Integer(), nullable=False),
        sa.Column("critical_high_count_min", sa.Integer(), nullable=False),
        sa.Column("updated_by_user_id", sa.Integer(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_hotspot_risk_policy_id"), "hotspot_risk_policy", ["id"], unique=False)

    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("body", sa.String(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("related_report_id", sa.Integer(), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_notifications_id"), "notifications", ["id"], unique=False)
    op.create_index(op.f("ix_notifications_related_report_id"), "notifications", ["related_report_id"], unique=False)
    op.create_index(op.f("ix_notifications_user_id"), "notifications", ["user_id"], unique=False)

    op.create_table(
        "report_audit_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("report_id", sa.Integer(), nullable=False),
        sa.Column("previous_status", sa.String(), nullable=True),
        sa.Column("new_status", sa.String(), nullable=True),
        sa.Column("changed_by_user_id", sa.Integer(), nullable=False),
        sa.Column("assigned_to_user_id", sa.Integer(), nullable=True),
        sa.Column("note", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_report_audit_logs_id"), "report_audit_logs", ["id"], unique=False)
    op.create_index(op.f("ix_report_audit_logs_report_id"), "report_audit_logs", ["report_id"], unique=False)

    op.create_table(
        "reports",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("issue_type", sa.String(), nullable=False),
        sa.Column("severity_level", sa.String(), nullable=False),
        sa.Column("urgency_score", sa.Float(), nullable=False),
        sa.Column("priority_label", sa.String(), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("image_url", sa.String(), nullable=True),
        sa.Column("auto_response", sa.String(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("assigned_to_user_id", sa.Integer(), nullable=True),
        sa.Column("resolution_note", sa.String(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_reports_id"), "reports", ["id"], unique=False)
    op.create_index("ix_reports_created_at", "reports", ["created_at"], unique=False)
    op.create_index("ix_reports_issue_type", "reports", ["issue_type"], unique=False)
    op.create_index("ix_reports_lat_lng", "reports", ["latitude", "longitude"], unique=False)
    op.create_index("ix_reports_priority_label", "reports", ["priority_label"], unique=False)
    op.create_index("ix_reports_status", "reports", ["status"], unique=False)

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_id"), "users", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_users_id"), table_name="users")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")

    op.drop_index("ix_reports_status", table_name="reports")
    op.drop_index("ix_reports_priority_label", table_name="reports")
    op.drop_index("ix_reports_lat_lng", table_name="reports")
    op.drop_index("ix_reports_issue_type", table_name="reports")
    op.drop_index("ix_reports_created_at", table_name="reports")
    op.drop_index(op.f("ix_reports_id"), table_name="reports")
    op.drop_table("reports")

    op.drop_index(op.f("ix_report_audit_logs_report_id"), table_name="report_audit_logs")
    op.drop_index(op.f("ix_report_audit_logs_id"), table_name="report_audit_logs")
    op.drop_table("report_audit_logs")

    op.drop_index(op.f("ix_notifications_user_id"), table_name="notifications")
    op.drop_index(op.f("ix_notifications_related_report_id"), table_name="notifications")
    op.drop_index(op.f("ix_notifications_id"), table_name="notifications")
    op.drop_table("notifications")

    op.drop_index(op.f("ix_hotspot_risk_policy_id"), table_name="hotspot_risk_policy")
    op.drop_table("hotspot_risk_policy")

    op.drop_index(op.f("ix_dashboard_views_user_id"), table_name="dashboard_views")
    op.drop_index(op.f("ix_dashboard_views_id"), table_name="dashboard_views")
    op.drop_table("dashboard_views")
