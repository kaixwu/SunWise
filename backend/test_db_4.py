import psycopg2

project_ref = "kjljzzkbemajamknykua"
password = "Hq3cpS8DDPRCHtsL"

urls = {
    "Direct Host IPv6 (5432)": f"postgresql://postgres:{password}@db.{project_ref}.supabase.co:5432/postgres",
    "Pooler Session (5432)": f"postgresql://postgres.{project_ref}:{password}@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres",
    "Pooler Transaction (6543)": f"postgresql://postgres.{project_ref}:{password}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres",
    "Pooler Session SSL (5432)": f"postgresql://postgres.{project_ref}:{password}@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require",
    "Pooler Transaction SSL (6543)": f"postgresql://postgres.{project_ref}:{password}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require",
    
    # Try the aws-1 server as well
    "Pooler Transaction SSL aws-1 (6543)": f"postgresql://postgres.{project_ref}:{password}@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require"
}

print("Running fast connection tests...")
for name, url in urls.items():
    print(f"Testing {name}...")
    try:
        conn = psycopg2.connect(url, connect_timeout=3)
        print(f"--> SUCCESS")
        conn.close()
    except Exception as e:
        err_msg = str(e).strip().split('\n')[0]
        print(f"--> FAILED: {err_msg}")
print("Tests completed.")
