import os

def replace_in_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    new_content = content.replace(
        'import { DateInput } from "@/components/ui/DateInput";',
        'import { DatePickerInput } from "@/components/ui/DatePickerInput";'
    )
    new_content = new_content.replace('<DateInput', '<DatePickerInput')
    new_content = new_content.replace('</DateInput>', '</DatePickerInput>')

    if content != new_content:
        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f"Updated {filepath}")

def main():
    src_dir = 'src'
    for root, dirs, files in os.walk(src_dir):
        for file in files:
            if file.endswith('.tsx') or file.endswith('.ts'):
                replace_in_file(os.path.join(root, file))

if __name__ == "__main__":
    main()
