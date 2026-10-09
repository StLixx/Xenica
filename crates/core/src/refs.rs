//! 正文里提到别的节点的写法：`#标记` 和 `[[名字]]`。
//!
//! 规则（前端渲染时用同样的规则，见 `web/src/ui/markdown.ts`）：
//! - `#` 前面是开头或空白，后面紧跟名字；名字到空白或标点为止，不能全是数字。`# 标题` 不算。
//! - `[[名字]]` 里的名字去掉首尾空白。
//! - 代码（`` ` ``、```` ``` ````）和公式（`$`、`$$`）里的不算。

const STOP: &[char] = &[
    ',', '.', ';', ':', '!', '?', '(', ')', '[', ']', '{', '}', '"', '\'', '<', '>', '`', '$', '#',
    '，', '。', '；', '：', '！', '？', '、', '（', '）', '【', '】', '「', '」', '《', '》', '“',
    '”', '‘', '’',
];

/// 按出现顺序返回提到的名字（去重）。
pub fn extract_refs(md: &str) -> Vec<String> {
    let chars = mask_code_and_math(md);
    let mut out: Vec<String> = Vec::new();
    let mut push = |name: &str| {
        let name = name.trim();
        if !name.is_empty()
            && name.chars().count() <= crate::MAX_TITLE_CHARS
            && !out.iter().any(|n| n == name)
        {
            out.push(name.to_owned());
        }
    };
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c == '['
            && chars.get(i + 1) == Some(&'[')
            && let Some(end) = find_str(&chars, i + 2, &[']', ']'])
        {
            let name: String = chars[i + 2..end].iter().collect();
            if !name.contains('\n') {
                push(&name);
            }
            i = end + 2;
            continue;
        }
        if c == '#' && (i == 0 || chars[i - 1].is_whitespace()) {
            let len = chars[i + 1..]
                .iter()
                .take_while(|&&x| !x.is_whitespace() && !STOP.contains(&x))
                .count();
            let name: String = chars[i + 1..i + 1 + len].iter().collect();
            if len > 0 && !name.chars().all(|x| x.is_ascii_digit()) {
                push(&name);
            }
            i += 1 + len;
            continue;
        }
        i += 1;
    }
    out
}

/// 把代码（围栏、行内）和公式（`$$…$$` 可跨行，`$…$` 不跨行）换成空格，转义字符也换掉。
fn mask_code_and_math(md: &str) -> Vec<char> {
    let mut chars: Vec<char> = md.chars().collect();
    let n = chars.len();
    let blank = |chars: &mut Vec<char>, from: usize, to: usize| {
        for c in &mut chars[from..to.min(n)] {
            if *c != '\n' {
                *c = ' ';
            }
        }
    };
    let mut i = 0;
    while i < n {
        let line_start = i == 0 || chars[i - 1] == '\n';
        let c = chars[i];
        if line_start && chars[i..].starts_with(&['`', '`', '`']) {
            // 围栏代码：到下一个以 ``` 开头的行为止
            let mut j = i + 3;
            let close = loop {
                match chars[j..].iter().position(|&x| x == '\n') {
                    Some(k) => {
                        j += k + 1;
                        if chars[j..].starts_with(&['`', '`', '`']) {
                            break j + 3;
                        }
                    }
                    None => break n,
                }
            };
            blank(&mut chars, i, close);
            i = close;
            continue;
        }
        match c {
            '\\' => {
                blank(&mut chars, i, i + 2);
                i += 2;
            }
            '$' if chars.get(i + 1) == Some(&'$') => {
                let close = find_str(&chars, i + 2, &['$', '$']).map_or(n, |k| k + 2);
                blank(&mut chars, i, close);
                i = close;
            }
            '$' | '`' => {
                let close = (i + 1..n)
                    .take_while(|&k| chars[k] != '\n')
                    .find(|&k| chars[k] == c && chars[k - 1] != '\\')
                    .map(|k| k + 1);
                match close {
                    Some(k) => {
                        blank(&mut chars, i, k);
                        i = k;
                    }
                    None => i += 1,
                }
            }
            _ => i += 1,
        }
    }
    chars
}

fn find_str(chars: &[char], from: usize, pat: &[char]) -> Option<usize> {
    if chars.len() < pat.len() {
        return None;
    }
    (from..=chars.len() - pat.len()).find(|&j| chars[j..].starts_with(pat))
}

#[cfg(test)]
mod tests {
    use super::extract_refs;

    #[test]
    fn tags_and_links() {
        assert_eq!(
            extract_refs("$\\int \\sec x dx$ #必备 #积分公式，见 [[ 积分公式表 ]]"),
            vec!["必备", "积分公式", "积分公式表"]
        );
    }

    #[test]
    fn ignores_headings_numbers_code_and_math() {
        let md = "# 标题\n第#3题 #12 `#代码` $a \\# b$ $$#x$$\n```\n#围栏\n```\n#末尾";
        assert_eq!(extract_refs(md), vec!["末尾"]);
    }

    #[test]
    fn tags_after_multiline_math() {
        let md = "$$\n\\lim_{n\\to\\infty} (1+\\frac1n)^n = e\n$$ #必备 #数列方法";
        assert_eq!(extract_refs(md), vec!["必备", "数列方法"]);
        assert_eq!(
            extract_refs("$$\n#不算\n$$\n```\n#也不算\n```\n#算"),
            vec!["算"]
        );
    }

    #[test]
    fn dedupes_in_order() {
        assert_eq!(extract_refs("#a #b #a [[b]]"), vec!["a", "b"]);
    }
}
