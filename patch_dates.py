import os
import re

def fix_date_formatting():
    src_dir = "frontend/src"
    
    # Regex to find {obj.dateField} inside <td> or <span>
    # e.g. <td className="..."> {trip.scheduledDate} </td>
    # We want to make sure it's not already wrapped in formatDate
    
    pattern = re.compile(r'(\{([a-zA-Z0-9_]+\.(?:[a-zA-Z0-9_]*[dD]ate[a-zA-Z0-9_]*))\})')
    
    modified_files = 0
    for root, dirs, files in os.walk(src_dir):
        for file in files:
            if file.endswith(".tsx"):
                filepath = os.path.join(root, file)
                with open(filepath, "r") as f:
                    content = f.read()
                
                new_content = content
                needs_import = False
                
                # Exclude form inputs where value={form.date} is correct
                # We only want to replace it when it's rendered as text
                # A good heuristic is looking for >{obj.date}<
                
                # Find all >{...}<
                text_render_pattern = re.compile(r'>\s*\{([a-zA-Z0-9_?]+\.(?:[a-zA-Z0-9_]*[dD]ate[a-zA-Z0-9_]*))\}\s*<')
                
                matches = text_render_pattern.findall(content)
                if matches:
                    for match in set(matches):
                        if "formatDate" not in match and "fmtDate" not in match and "formatDateTime" not in match:
                            print(f"Found unformatted date {match} in {filepath}")
                            # Replace >{match}< with >{formatDate(match)}<
                            new_content = re.sub(
                                r'>\s*\{' + re.escape(match) + r'\}\s*<',
                                r'>{formatDate(' + match + r')}<',
                                new_content
                            )
                            needs_import = True
                
                if needs_import:
                    if 'import { formatDate' not in new_content:
                        # Find the last import line
                        import_lines = [line for line in new_content.splitlines() if line.startswith("import ")]
                        if import_lines:
                            last_import = import_lines[-1]
                            new_content = new_content.replace(
                                last_import, 
                                last_import + '\nimport { formatDate } from "@/lib/format-date";'
                            )
                        else:
                            new_content = 'import { formatDate } from "@/lib/format-date";\n' + new_content
                    
                    with open(filepath, "w") as f:
                        f.write(new_content)
                    print(f"Updated {filepath}")
                    modified_files += 1

    print(f"Total files updated: {modified_files}")

if __name__ == "__main__":
    fix_date_formatting()
