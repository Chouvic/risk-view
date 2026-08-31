"""Persistence layer: ORM models, engine/session plumbing, and the repository.

`riskview.schemas` stays the contract every other layer speaks; nothing in this
package leaks upward. The repository maps rows to those Pydantic models
explicitly, so a corrupted row fails validation loudly instead of being trusted.
"""
