"""Database models for Neutron Web"""
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, JSON
from sqlalchemy.orm import declarative_base, relationship
from datetime import datetime, timezone


def utcnow():
    return datetime.now(timezone.utc)

Base = declarative_base()


class Host(Base):
    __tablename__ = "hosts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    ip_address = Column(String(255), nullable=False)
    port = Column(Integer, default=22)
    user = Column(String(100), nullable=False)
    private_key_path = Column(String(500), nullable=True)
    strict_host_checking = Column(Boolean, default=False)
    tags = Column(JSON, default=list)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    # Relationships
    commands = relationship("CommandHistory", back_populates="host", cascade="all, delete-orphan")


class CommandHistory(Base):
    __tablename__ = "command_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    host_id = Column(Integer, ForeignKey("hosts.id"))
    command = Column(Text, nullable=False)
    output = Column(Text, nullable=True)
    exit_code = Column(Integer, nullable=True)
    executed_at = Column(DateTime, default=utcnow)
    status = Column(String(20), default="running")  # running, success, failed

    host = relationship("Host", back_populates="commands")


class Playbook(Base):
    __tablename__ = "playbooks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    commands = Column(JSON, nullable=False)  # List of commands
    host_ids = Column(JSON, nullable=False)  # List of target host IDs
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(100), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    is_admin = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow)
