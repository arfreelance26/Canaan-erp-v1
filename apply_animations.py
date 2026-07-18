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
    # 1. Add animate-stagger to page containers
    page_files = glob.glob(os.path.join(frontend_dir, "src/app/**/page.tsx"), recursive=True)
    for file in page_files:
        replace_in_file(
            file, 
            r'className="flex flex-col gap-6"', 
            r'className="animate-stagger flex flex-col gap-6"'
        )
        replace_in_file(
            file, 
            r'className="flex flex-col gap-8"', 
            r'className="animate-stagger flex flex-col gap-8"'
        )

    # 2. Add glassmorphism to Table roots
    table_files = glob.glob(os.path.join(frontend_dir, "src/components/**/*Table.tsx"), recursive=True)
    for file in table_files:
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
        
    # 3. Handle StatCard hover effects
    statcard_file = os.path.join(frontend_dir, "src/components/dashboard/StatCard.tsx")
    if os.path.exists(statcard_file):
        replace_in_file(
            statcard_file,
            r'className="relative overflow-hidden rounded-xl border border-gray-200 bg-white p-6 shadow-sm"',
            r'className="group relative overflow-hidden flex flex-col justify-between rounded-xl border border-white/60 bg-white/40 p-6 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(0,0,0,0.12)] hover:border-white/80 hover:bg-white/60"'
        )

    # 4. Handle some Dialogs
    dialog_files = glob.glob(os.path.join(frontend_dir, "src/components/**/*Dialog.tsx"), recursive=True)
    for file in dialog_files:
        replace_in_file(
            file,
            r'className="fixed left-\[50%\] top-\[50%\] z-50 grid w-full max-w-lg translate-x-\[-50%\] translate-y-\[-50%\] gap-4 border bg-white p-6 shadow-lg duration-200 sm:rounded-lg"',
            r'className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-white/50 bg-white/90 p-6 shadow-[0_10px_40px_rgba(0,0,0,0.1)] backdrop-blur-2xl duration-200 sm:rounded-2xl animate-dialog-enter"'
        )

if __name__ == "__main__":
    main()
