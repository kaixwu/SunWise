import os
import glob
import re

path = "c:/Users/ASUS/Documents/college/bsit 3-2/adet/SunWise/frontend/src/**/*.jsx"
files = glob.glob(path, recursive=True)

for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    if 'Authorization' in content:
        # We replace the headers objects
        # e.g., { headers: { Authorization: `Bearer ${token}` } }
        content = re.sub(r',\s*\{\s*headers:\s*\{\s*Authorization:\s*`Bearer \$\{token\}`\s*\}\s*\}', '', content)
        content = re.sub(r'headers:\s*\{\s*Authorization:\s*`Bearer \$\{token\}`\s*\}', '', content)
        
        with open(f, 'w', encoding='utf-8') as file:
            file.write(content)
        print(f"Updated {f}")
