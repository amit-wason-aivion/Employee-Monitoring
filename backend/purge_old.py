import os
import sys
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).with_name(".env"))

DATABASE_URL = os.getenv("DATABASE_URL", "")
DATA_RETENTION_DAYS = int(os.getenv("DATA_RETENTION_DAYS", "60"))

if not DATABASE_URL:
    print("DATABASE_URL is not set")
    sys.exit(1)

if DATA_RETENTION_DAYS <= 0:
    print("DATA_RETENTION_DAYS is <= 0, nothing to purge")
    sys.exit(0)

conn = psycopg2.connect(DATABASE_URL)
try:
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM agent_activities
                WHERE received_at < NOW() - (%s * INTERVAL '1 day')
                """,
                (DATA_RETENTION_DAYS,),
            )
            print(f"Purged {cur.rowcount} rows older than {DATA_RETENTION_DAYS} days")
finally:
    conn.close()
