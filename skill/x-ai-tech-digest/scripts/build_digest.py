#!/usr/bin/env python3

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path

POSITIVE_KEYWORDS = {
    "ai": [
        "ai",
        "llm",
        "gpt",
        "agent",
        "model",
        "openai",
        "anthropic",
        "claude",
        "gemini",
        "deepseek",
        "inference",
        "transformer",
        "rag",
        "multimodal",
        "embedding",
    ],
    "chips": [
        "gpu",
        "cpu",
        "npu",
        "cuda",
        "chip",
        "semiconductor",
        "datacenter",
        "server",
        "cluster",
        "hbm",
        "memory",
        "blackwell",
        "h100",
        "b200",
    ],
    "software": [
        "python",
        "javascript",
        "typescript",
        "rust",
        "go ",
        "compiler",
        "runtime",
        "sdk",
        "api",
        "docker",
        "kubernetes",
        "linux",
        "macos",
        "windows",
        "webgpu",
        "framework",
    ],
    "signal": [
        "launch",
        "release",
        "benchmark",
        "funding",
        "acquisition",
        "paper",
        "dataset",
        "security",
        "outage",
        "pricing",
        "preview",
    ],
}

NEGATIVE_KEYWORDS = [
    "giveaway",
    "nba",
    "football",
    "soccer",
    "celebrity",
    "meme",
    "motivation",
    "horoscope",
]


def parse_args():
    parser = argparse.ArgumentParser(
        description="Filter X candidates for AI/computer-tech posts and render a markdown digest."
    )
    parser.add_argument("--input", required=True, help="Path to candidates.json")
    parser.add_argument("--output", required=True, help="Path to digest markdown")
    parser.add_argument("--top", type=int, default=12, help="Maximum number of items")
    return parser.parse_args()


def normalize_text(value):
    return re.sub(r"\s+", " ", (value or "")).strip()


def contains_keyword(text, keyword):
    if re.search(r"[^\x00-\x7F]", keyword):
        return keyword in text
    pattern = r"(?<![a-z0-9_])" + re.escape(keyword.strip()) + r"(?![a-z0-9_])"
    return re.search(pattern, text) is not None


def score_item(item):
    text = normalize_text(item.get("text", "")).lower()
    if not text:
        return 0, []

    score = 0
    reasons = []
    for label, keywords in POSITIVE_KEYWORDS.items():
        matches = [word for word in keywords if contains_keyword(text, word)]
        if matches:
            score += len(matches) * 3
            reasons.append(f"{label}: {', '.join(matches[:3])}")

    if item.get("source") == "profile":
        score += 2
        reasons.append("来自我的转发")
    if item.get("source") == "home":
        score += 1
        reasons.append("来自推荐流")

    negatives = [word for word in NEGATIVE_KEYWORDS if contains_keyword(text, word)]
    if negatives:
        score -= len(negatives) * 4
        reasons.append(f"降权: {', '.join(negatives[:3])}")

    # Prefer posts that include concrete links or named releases.
    if re.search(r"\b(v?\d+\.\d+|api|sdk|model|release|benchmark)\b", text):
        score += 3
        reasons.append("包含具体版本/发布信号")

    return score, reasons


def build_summary(item):
    text = normalize_text(item.get("text", ""))
    if len(text) <= 140:
        return text
    return text[:137] + "..."


def label_for_source(source):
    if source == "profile":
        return "我的转发"
    if source == "home":
        return "推荐"
    return source or "未知"


def build_item_takeaway(entry):
    item = entry["item"]
    text = normalize_text(item.get("text", ""))
    if not text:
        return "内容较短，但关键词相关性较高。"
    if len(text) <= 60:
        return text
    return text[:60] + "..."


def build_overview(selected):
    source_counts = {"profile": 0, "home": 0}
    for entry in selected:
        source_counts[entry["item"].get("source")] = source_counts.get(
            entry["item"].get("source"), 0
        ) + 1
    parts = []
    if source_counts.get("home"):
        parts.append(f"For you 推荐 {source_counts['home']} 条")
    if source_counts.get("profile"):
        parts.append(f"当日转发 {source_counts['profile']} 条")
    return "，".join(parts) if parts else "本次未识别出明确来源。"


def build_conclusion(selected):
    if not selected:
        return "今天没有形成明确的 AI / 电脑技术主题。"
    top_keywords = []
    for entry in selected:
        for reason in entry["reasons"]:
            if ": " not in reason:
                continue
            _, values = reason.split(": ", 1)
            for value in values.split(", "):
                if value and value not in top_keywords:
                    top_keywords.append(value)
    if not top_keywords:
        return "今天的入选内容以 AI 与软件工具类信息为主。"
    return "今天高频主题包括：" + "、".join(top_keywords[:6]) + "。"


def render_digest(selected, generated_at):
    lines = [
        f"# X AI / 电脑技术日报",
        "",
        f"生成时间: {generated_at}",
        "",
    ]
    if not selected:
        lines.extend(
            [
                "今天没有筛出高相关的 AI / 电脑技术内容。",
                "",
            ]
        )
        return "\n".join(lines)

    lines.extend(
        [
            "## 摘要",
            "",
            f"共筛选 {len(selected)} 条高相关内容，优先保留 AI、芯片、软件工程、平台工具和产品发布类信息。",
            build_overview(selected),
            "",
            "## 入选内容",
            "",
        ]
    )

    for idx, entry in enumerate(selected, start=1):
        item = entry["item"]
        lines.extend(
            [
                f"### {idx}. {item.get('author') or item.get('authorHandle') or '未知作者'}",
                "",
                f"- 来源: {label_for_source(item.get('source'))}",
                f"- 相关性: {entry['score']}",
                f"- 理由: {'; '.join(entry['reasons'][:3])}",
                f"- 原文链接: {item.get('url')}",
                f"- 内容摘要: {build_summary(item)}",
                f"- 内容总结: {build_item_takeaway(entry)}",
                "",
            ]
        )
        for link in item.get("externalLinks", [])[:3]:
            lines.append(f"- 附带链接: {link}")
        if item.get("externalLinks"):
            lines.append("")
        for image_url in item.get("media", [])[:4]:
            lines.append(f"![{item.get('author') or 'tweet-image'}]({image_url})")
        if item.get("media"):
            lines.append("")
    lines.extend(
        [
            "## 总结",
            "",
            build_conclusion(selected),
            "",
        ]
    )
    return "\n".join(lines)


def main():
    args = parse_args()
    input_path = Path(args.input)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    payload = json.loads(input_path.read_text())
    items = payload.get("items", [])

    ranked = []
    for item in items:
      score, reasons = score_item(item)
      if score >= 6:
          ranked.append({"item": item, "score": score, "reasons": reasons})

    ranked.sort(
        key=lambda entry: (
            -entry["score"],
            entry["item"].get("publishedAt") or "",
            entry["item"].get("capturedAt") or "",
        )
    )

    selected = ranked[: args.top]
    generated_at = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M:%S %Z")
    digest = render_digest(selected, generated_at)
    output_path.write_text(digest)
    print(f"Wrote digest with {len(selected)} items to {output_path}")


if __name__ == "__main__":
    main()
