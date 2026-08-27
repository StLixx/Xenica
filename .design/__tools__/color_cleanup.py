"""
Replace arbitrary hex colors in two HTML pages with CSS variable references.
Keeps Tailwind class list intact but drops the `bg-[#...]` / `text-[#...]` pieces,
inserting style="..." where needed.
"""
import re, pathlib

FILES = [
    r'c:\dev\Xenica\.design\pages\heptabook-with-sidebar.html',
    r'c:\dev\Xenica\.design\pages\heptabook-without-sidebar.html',
]

# Map of arbitrary color tokens → CSS variable (backgrounds)
BG_MAP = {
    '#1f1f1d': '--xe-htb-bg',
    '#2a2a28': '--xe-htb-panel',
    '#ff5f57': '--xe-mac-red',
    '#febc2e': '--xe-mac-yellow',
    '#28c840': '--xe-mac-green',
    '#f1f1ef': '--xe-htb-ink',  # for text
}

for fp in FILES:
    p = pathlib.Path(fp)
    txt = p.read_text(encoding='utf-8')
    orig = txt

    # Replace arbitrary bg-[#xxx] → background CSS var via style="..."
    for hex_, var in BG_MAP.items():
        # match `bg-[#xxx]` followed by either space, end quote, slash (no slash since colors)
        # we don't have opacity variants so simple pattern
        pattern = rf'bg-\[{re.escape(hex_)}\]'
        # We replace by inserting or appending a style attr to the same tag
        # Strategy: replace token with empty then post-process to inject style
        # Easier: replace the class string with an explicit style on the parent
        # We do a callback
        def repl_bg(match):
            return ''  # strip class token; we'll inject style on parent in a second pass
        txt = re.sub(pattern, repl_bg, txt)

        # text-[#xxx] similarly
        pattern_text = rf'text-\[{re.escape(hex_)}\]'
        txt = re.sub(pattern_text, '', txt)

    # Cleanup double spaces in class attributes caused by stripping
    txt = re.sub(r'class="  +', 'class="', txt)
    txt = re.sub(r'  +"', '"', txt)
    txt = re.sub(r' {2,}', ' ', txt)

    # Now inject style="background:var(--xe-htb-bg)" on top-level elements whose stripped bg
    # we need to recover. To keep simple: we identify elements that previously had bg-[#1f1f1d]
    # or bg-[#2a2a28] on a meaningful element (main, aside, section, article, div class).
    # We'll inject via heuristic: if element lost its bg but tag is main/aside/section/article/footer,
    # add the matching style.

    # Re-do on the original file but with awareness: easier to use original positions.
    # Since we already mutated txt, simplest is to do a full re-parse pass: for each main/aside/section/article/footer
    # that has no style attr and no bg class, inject one based on a marker comment.

    # Simpler approach: keep original text and replace each bg-[#xxx] occurrence with the inline style version,
    # adding/replacing a style attribute on the element.

    # Restart: re-read original
    txt2 = orig
    def inject_style(match, hex_to_var):
        tag_open = match.group(1)
        attrs = match.group(2)
        closing = match.group(3)
        # Check if style attr exists
        if 'style="' in attrs:
            new_attrs = attrs.replace('style="', f'style="background:var({hex_to_var}); ', 1)
        else:
            new_attrs = attrs.rstrip() + f' style="background:var({hex_to_var});"'
        return f'<{tag_open}{new_attrs}{closing}'

    # For each color, find its occurrence on the opening tag of any element
    # We'll match `<(tag)[^>]*bg-\[#xxx\][^>]*>` and inject style on that tag
    for hex_, var in BG_MAP.items():
        # background
        pattern = re.compile(rf'<([a-zA-Z][a-zA-Z0-9-]*)([^>]*?\s)bg-\[{re.escape(hex_)}\]([^>]*?)(/?)>')
        def repl(m, v=var):
            tag = m.group(1)
            pre = m.group(2)
            post = m.group(3)
            slash = m.group(4)
            attrs = (pre + post).strip()
            if 'style="' in attrs:
                attrs = re.sub(r'style="', f'style="background:var({v}); ', attrs, count=1)
            else:
                attrs = attrs + f' style="background:var({v});"'
            attrs = re.sub(r' {2,}', ' ', attrs).strip()
            return f'<{tag} {attrs}{slash}>'
        txt2 = pattern.sub(repl, txt2)

        # text
        pattern_text = re.compile(rf'<([a-zA-Z][a-zA-Z0-9-]*)([^>]*?\s)text-\[{re.escape(hex_)}\]([^>]*?)(/?)>')
        def repl_text(m, v=var):
            tag = m.group(1)
            pre = m.group(2)
            post = m.group(3)
            slash = m.group(4)
            attrs = (pre + post).strip()
            if 'style="' in attrs:
                attrs = re.sub(r'style="', f'style="color:var({v}); ', attrs, count=1)
            else:
                attrs = attrs + f' style="color:var({v});"'
            attrs = re.sub(r' {2,}', ' ', attrs).strip()
            return f'<{tag} {attrs}{slash}>'
        txt2 = pattern_text.sub(repl_text, txt2)

    # Also strip leftover style="color:var(--xe-htb-ink)" if element already has bg in style
    # Actually keep it simple — both attrs OK.

    # Cleanup double spaces in attributes
    txt2 = re.sub(r' {2,}', ' ', txt2)
    txt2 = re.sub(r'=" ', '="', txt2)

    if txt2 != orig:
        p.write_text(txt2, encoding='utf-8')
        print(f'[OK] Rewrote {fp}')
    else:
        print(f'[--] No changes: {fp}')