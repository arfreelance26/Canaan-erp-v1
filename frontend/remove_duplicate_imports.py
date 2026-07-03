import os

def remove_duplicate(filepath):
    with open(filepath, 'r') as f:
        lines = f.readlines()
    
    new_lines = []
    import_seen = False
    modified = False

    import_statement = 'import { DatePickerInput } from "@/components/ui/DatePickerInput";'

    for line in lines:
        if import_statement in line:
            if import_seen:
                modified = True
                continue
            import_seen = True
        new_lines.append(line)
    
    if modified:
        with open(filepath, 'w') as f:
            f.writelines(new_lines)
        print(f"Removed duplicate import from {filepath}")

def main():
    src_dir = 'src'
    for root, dirs, files in os.walk(src_dir):
        for file in files:
            if file.endswith('.tsx') or file.endswith('.ts'):
                remove_duplicate(os.path.join(root, file))

if __name__ == "__main__":
    main()
