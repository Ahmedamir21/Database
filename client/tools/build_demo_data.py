#!/usr/bin/env python3
"""
Build the demonstration data of the client from the real seed and the real report registry.

Why this tool exists
--------------------
The application is delivered for a SQL Server instance, and the whole interface reads its
numbers from the API. During the presentation of the project (and in any environment where
SQL Server is not installed, for example the machine of a marker who only wants to click
through the screens), the client can answer its own calls from the same sample data that
database/02_seed.sql inserts. To make sure that this "demonstration mode" can never drift
away from the delivered database, the data module is GENERATED from the seed file and from
server/src/reports/registry.js - it is not typed by hand.

    python3 client/tools/build_demo_data.py

writes
    client/src/mock/demo-data.js      the tables of database/02_seed.sql as JavaScript arrays
    client/src/mock/demo-reports.js   the report catalogue, with the column list that the SQL
                                      of every report returns (read out of the registry)

It needs no SQL Server and no npm package: only the standard library.
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
SEED = ROOT / 'database' / '02_seed.sql'
REGISTRY = ROOT / 'server' / 'src' / 'reports' / 'registry.js'
OUT_DATA = ROOT / 'client' / 'src' / 'mock' / 'demo-data.js'
OUT_REPORTS = ROOT / 'client' / 'src' / 'mock' / 'demo-reports.js'

TABLES = ['Department', 'Program', 'Room', 'AppUser', 'Student', 'Instructor', 'Admin',
          'Course', 'Prerequisite', 'Semester', 'Section', 'Enrollment', 'Attendance',
          'Payment', 'Announcement']


# --------------------------------------------------------------------------- the seed file

def split_top_level(text, separator=','):
    """Split on the separators that are not inside parentheses, quotes or brackets."""
    parts, current, depth, quote, brackets = [], [], 0, False, 0
    index = 0
    while index < len(text):
        char = text[index]
        if quote:
            current.append(char)
            if char == "'":
                if index + 1 < len(text) and text[index + 1] == "'":
                    current.append("'")
                    index += 1
                else:
                    quote = False
        elif char == "'":
            quote = True
            current.append(char)
        elif char in '([{':
            depth += 1
            if char == '{':
                brackets += 1
            current.append(char)
        elif char in ')]}':
            depth -= 1
            if char == '}':
                brackets -= 1
            current.append(char)
        elif char == separator and depth == 0 and brackets == 0:
            parts.append(''.join(current))
            current = []
        else:
            current.append(char)
        index += 1
    parts.append(''.join(current))
    return parts


def only_the_values(block):
    """The text between VALUES and the closing semicolon, without comments."""
    text = re.sub(r'/\*.*?\*/', ' ', block, flags=re.S)
    text = re.sub(r'--[^\n]*', ' ', text)
    start = text.upper().find('VALUES')
    body = text[start + len('VALUES'):]
    end = body.rfind(');')
    if end == -1:
        end = body.rfind(')')
    return body[:end + 1]


def tuples_of(text):
    """Every balanced (...) group of the text, the nested ones included in their parent."""
    groups, depth, start, quote, index = [], 0, None, False, 0
    while index < len(text):
        char = text[index]
        if quote:
            if char == "'":
                if index + 1 < len(text) and text[index + 1] == "'":
                    index += 1
                else:
                    quote = False
        elif char == "'":
            quote = True
        elif char == '(':
            if depth == 0:
                start = index
            depth += 1
        elif char == ')':
            depth -= 1
            if depth == 0 and start is not None:
                groups.append(text[start + 1:index])
                start = None
        index += 1
    return groups


def parse_values(values_text):
    """Every (...) tuple of the text that follows VALUES, as a list of Python values."""
    body = re.sub(r'--[^\n]*', ' ', values_text)
    body = re.sub(r'/\*.*?\*/', ' ', body, flags=re.S)
    end = body.rfind(')')
    body = body[:end + 1]
    rows = []
    for inner in tuples_of(body):
        values = []
        for raw in split_top_level(inner):
            raw = raw.strip()
            if not raw:
                continue
            if raw.upper() == 'NULL':
                values.append(None)
            elif raw.startswith("'"):
                values.append(raw[1:-1].replace("''", "'"))
            else:
                values.append(float(raw) if '.' in raw else int(raw))
        rows.append(values)
    return rows


def read_seed():
    text = SEED.read_text(encoding='utf-8')
    tables = {}
    for table in TABLES:
        pattern = re.compile(
            r'INSERT\s+INTO\s+dbo\.%s\s*\(([^)]*)\)\s*VALUES(.*?);' % table,
            re.S | re.I)
        columns, rows = None, []
        for match in pattern.finditer(text):
            names = [name.strip() for name in match.group(1).split(',')]
            if columns is None:
                columns = names
            assert names == columns, f'{table}: the seed uses two different column lists'
            for values in parse_values(match.group(2)):
                assert len(values) == len(columns), f'{table}: {values} does not match {columns}'
                rows.append(dict(zip(columns, values)))
        if columns:
            tables[table] = rows
    return tables


# ----------------------------------------------------------------- the report registry (.js)

def js_string(text):
    return json.dumps(text, ensure_ascii=False)


def strip_sql_furniture(sql):
    """Remove the string literals and the comments, so the column scan is not confused."""
    sql = re.sub(r'--[^\n]*', ' ', sql)
    sql = re.sub(r'/\*.*?\*/', ' ', sql, flags=re.S)
    sql = re.sub(r"'(?:[^']|'')*'", "''", sql)
    return sql


def top_select_head(sql):
    """The select list of the statement that produces the rows of the report."""
    text = strip_sql_furniture(sql)
    depth, index = 0, 0
    while index < len(text):
        char = text[index]
        if char == '(':
            depth += 1
        elif char == ')':
            depth -= 1
        elif depth == 0 and text[index:index + 6].upper() == 'SELECT':
            position, inner = index + 6, 0
            while position < len(text):
                here = text[position]
                if here == '(':
                    inner += 1
                elif here == ')':
                    inner -= 1
                elif inner == 0 and text[position:position + 4].upper() == 'FROM':
                    return text[index + 6:position]
                position += 1
            return text[index + 6:]
        index += 1
    raise AssertionError('the report has no SELECT')


def select_columns(sql):
    """The names of the columns of the first row of a report, in order."""
    head = top_select_head(sql)
    columns = []
    for part in split_top_level(head):
        part = part.strip().rstrip(';').strip()
        match = re.search(r'\bAS\s+(\w+)\s*$', part, re.I)
        if match:
            columns.append(match.group(1))
            continue
        part = re.sub(r'^TOP\s*\(?\s*\d+\s*\)?\s*', '', part, flags=re.I)
        part = re.sub(r'^DISTINCT\s+', '', part, flags=re.I)
        if re.fullmatch(r'[\w\.\[\]]+', part):
            columns.append(part.split('.')[-1].strip('[]'))
            continue
        raise AssertionError(f'cannot read the column of "{part[:60]}"')
    return columns


def instructor_reports():
    """the keys of REPORT_ROLES in the API that an instructor may run - one source of truth"""
    text = (ROOT / 'server' / 'src' / 'services' / 'reportService.js').read_text(encoding='utf-8')
    block = text[text.index('export const REPORT_ROLES'):]
    block = block[:block.index('};')]
    keys = []
    for match in re.finditer(r"'(R\d\.\d+)':\s*\[([^\]]*)\]", block):
        if 'Instructor' in match.group(2):
            keys.append(match.group(1))
    return keys


def read_registry():
    text = REGISTRY.read_text(encoding='utf-8')

    shared = {}
    for match in re.finditer(r'const\s+(\w+_PARAM)\s*=\s*\{(.*?)\};', text, re.S):
        name = match.group(1)
        body = '{' + match.group(2) + '}'
        body = re.sub(r'//[^\n]*', '', body)
        body = re.sub(r',\s*\}', '}', body)
        shared[name] = json.loads(re.sub(r"(\w+):", r'"\1":', body).replace("'", '"'))

    categories = []
    for match in re.finditer(r"\{\s*key:\s*'([^']+)'\s*,\s*title:\s*'([^']+)'\s*,\s*hint:\s*'([^']+)'\s*\}", text):
        categories.append({'key': match.group(1), 'title': match.group(2), 'hint': match.group(3)})

    reports = []
    for match in re.finditer(r"\n  '(R\d\.\d+)': \{(.*?)\n  \},", text, re.S):
        key, body = match.group(1), match.group(2)

        def field(name):
            found = re.search(r"%s:\s*'((?:[^'\\]|\\.)*)'" % name, body)
            return found.group(1).replace("\\'", "'") if found else None

        params_text = re.search(r'params:\s*\[(.*?)\]', body, re.S).group(1).strip()
        params = []
        if params_text:
            for token in [t.strip() for t in params_text.split(',') if t.strip()]:
                if token in shared:
                    params.append(shared[token])
                else:
                    raw = re.sub(r"(\w+):", r'"\1":', token).replace("'", '"')
                    params.append(json.loads(re.sub(r',\s*\}', '}', raw)))

        sql = re.search(r'sql:\s*`(.*?)`\s*,?\s*$', body, re.S).group(1)
        labels_match = re.search(r'labels:\s*\{(.*?)\}', body, re.S)
        labels = {}
        if labels_match:
            for item in re.finditer(r"(\w+):\s*'([^']*)'", labels_match.group(1)):
                labels[item.group(1)] = item.group(2)

        reports.append({
            'key': key,
            'title': field('title'),
            'category': field('category'),
            'description': field('description'),
            'params': params,
            'labels': labels,
            'columns': select_columns(sql),
        })
    return categories, reports


# ----------------------------------------------------------------------------- the writers

def write_data(tables):
    lines = [
        '/**',
        ' * The sample data of the project, as JavaScript.',
        ' *',
        ' * GENERATED FILE - do not edit by hand. It is produced by',
        ' *',
        ' *     python3 client/tools/build_demo_data.py',
        ' *',
        ' * which reads database/02_seed.sql (the very rows the delivered database inserts) and',
        ' * writes them here again, so the demonstration mode of the interface speaks about the',
        ' * same students, sections, money and announcements as SQL Server does. The letter',
        ' * grades and the grade points are NOT in this file either: exactly like the database,',
        ' * the client rules compute them from the score (see client/src/mock/rules.js).',
        ' */',
        '',
        'export const SEED = {',
    ]
    for table, rows in tables.items():
        lines.append(f'  /* {len(rows)} rows */')
        lines.append(f'  {table}: [')
        for row in rows:
            fields = ', '.join(f'{name}: {json.dumps(value, ensure_ascii=False)}' for name, value in row.items())
            lines.append('    { ' + fields + ' },')
        lines.append('  ],')
    lines.append('};')
    lines.append('')
    lines.append('export default SEED;')
    lines.append('')
    OUT_DATA.parent.mkdir(parents=True, exist_ok=True)
    OUT_DATA.write_text('\n'.join(lines), encoding='utf-8')


def write_reports(categories, reports):
    lines = [
        '/**',
        ' * The catalogue of the reports, as JavaScript.',
        ' *',
        ' * GENERATED FILE - do not edit by hand:',
        ' *',
        ' *     python3 client/tools/build_demo_data.py',
        ' *',
        ' * reads server/src/reports/registry.js and copies the key, the title, the sentence, the',
        ' * parameters and the column list of every report. The SQL itself is NOT copied: in the',
        ' * delivered application it never leaves the server either.',
        ' */',
        '',
        'export const REPORT_CATEGORIES = [',
    ]
    for category in categories:
        lines.append('  { ' + ', '.join(f'{k}: {json.dumps(v, ensure_ascii=False)}' for k, v in category.items()) + ' },')
    lines.append('];')
    lines.append('')
    lines.append('export const REPORT_META = {')
    for report in reports:
        lines.append(f"  {json.dumps(report['key'])}: {{")
        lines.append(f"    key: {json.dumps(report['key'])},")
        lines.append(f"    title: {json.dumps(report['title'], ensure_ascii=False)},")
        lines.append(f"    category: {json.dumps(report['category'])},")
        lines.append(f"    description: {json.dumps(report['description'], ensure_ascii=False)},")
        lines.append(f"    params: {json.dumps(report['params'], ensure_ascii=False)},")
        lines.append(f"    labels: {json.dumps(report['labels'], ensure_ascii=False)},")
        lines.append(f"    columns: {json.dumps(report['columns'])},")
        lines.append('  },')
    lines.append('};')
    lines.append('')
    lines.append('export const REPORT_KEYS = Object.keys(REPORT_META);')
    lines.append('')
    lines.append('/** the reports an instructor may run (the office may run every report) */')
    lines.append('export const INSTRUCTOR_REPORTS = [')
    for key in instructor_reports():
        lines.append(f"  {json.dumps(key)},")
    lines.append('];')
    lines.append('')
    OUT_REPORTS.write_text('\n'.join(lines), encoding='utf-8')


def main():
    if not SEED.exists():
        sys.exit(f'the seed file {SEED} is missing')
    tables = read_seed()
    missing = [table for table in TABLES if table not in tables]
    if missing:
        sys.exit(f'the seed has no rows for {", ".join(missing)}')
    write_data(tables)
    categories, reports = read_registry()
    write_reports(categories, reports)
    total = sum(len(rows) for rows in tables.values())
    print(f'{OUT_DATA.relative_to(ROOT)}: {len(tables)} tables, {total} rows')
    print(f"{OUT_REPORTS.relative_to(ROOT)}: {len(reports)} reports, {len(categories)} categories")
    for report in reports:
        print(f"  {report['key']:5} {len(report['columns']):2} columns  {report['title']}")


if __name__ == '__main__':
    main()
