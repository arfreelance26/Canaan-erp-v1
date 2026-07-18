import os
import glob
import re

frontend_dir = r"c:\Users\rheni\OneDrive\Desktop\ERP V2\frontend"

def replace_in_file(filepath, pattern, replacement):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    new_content, count = re.subn(pattern, replacement, content)
    
    if count > 0:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated {filepath} ({count} replacements)")

def main():
    # 2. Add glassmorphism to Table roots
    table_files = glob.glob(os.path.join(frontend_dir, "src/components/**/*Table.tsx"), recursive=True)
    
    for file in table_files:
        replace_in_file(
            file,
            r'className="overflow-x-auto rounded-xl border border-gray-200 bg-white"',
            r'className="overflow-x-auto rounded-xl border border-white/80 bg-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]"'
        )
        # Some tables might have shadow-sm
        replace_in_file(
            file,
            r'className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm"',
            r'className="overflow-x-auto rounded-xl border border-white/80 bg-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]"'
        )
        
        # Add hover translate to table rows
        replace_in_file(
            file,
            r'<tr\s*key={([^}]+)}\s*className="hover:bg-gray-50/50">',
            r'<tr key={\1} className="group transition-all duration-500 ease-out hover:-translate-y-1 hover:shadow-[0_8px_20px_rgba(0,0,0,0.08)] hover:bg-white/80 hover:z-10">'
        )
        replace_in_file(
            file,
            r'<tr\s*key={([^}]+)}\s*className="group hover:bg-gray-50/50">',
            r'<tr key={\1} className="group transition-all duration-500 ease-out hover:-translate-y-1 hover:shadow-[0_8px_20px_rgba(0,0,0,0.08)] hover:bg-white/80 hover:z-10">'
        )
        # Try finding trs without className
        replace_in_file(
            file,
            r'<tr\s*key={([^}]+)}\s*>',
            r'<tr key={\1} className="group transition-all duration-500 ease-out hover:-translate-y-1 hover:shadow-[0_8px_20px_rgba(0,0,0,0.08)] hover:bg-white/80 hover:z-10">'
        )

if __name__ == "__main__":
    main()
