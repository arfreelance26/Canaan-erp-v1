import os
import re

def process_file(filepath):
    if "DecimalInput.tsx" in filepath:
        return
        
    with open(filepath, 'r') as f:
        content = f.read()

    new_content = content
    
    def repl(m):
        inner = m.group(1)
        if 'type="number"' in inner or "type='number'" in inner:
            return f"<DecimalInput {inner}>"
        return m.group(0)
    
    new_content = re.sub(r'<input\s+([^>]+)>', repl, new_content, flags=re.DOTALL)
    
    if new_content != content:
        new_content = new_content.replace('</input>', '</DecimalInput>')
        
        if 'DecimalInput' not in content:
            imports_end = new_content.rfind('import ')
            if imports_end != -1:
                end_of_line = new_content.find('\n', imports_end)
                new_content = new_content[:end_of_line+1] + 'import { DecimalInput } from "@/components/ui/DecimalInput";\n' + new_content[end_of_line+1:]
            else:
                new_content = 'import { DecimalInput } from "@/components/ui/DecimalInput";\n' + new_content
                
        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f"Updated {filepath}")

def main():
    src_dir = 'src'
    for root, dirs, files in os.walk(src_dir):
        for file in files:
            if file.endswith('.tsx'):
                process_file(os.path.join(root, file))

if __name__ == '__main__':
    main()
