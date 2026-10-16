import { Fragment } from "react";

export function ContentHeading({ content, level = 2 }: { content: { heading: string; emphasis: string; lineBreak: boolean }; level?: 1 | 2 }) {
  const Tag = level === 1 ? "h1" : "h2";
  return <Tag>{content.heading.split("\n").map((line, index) => <Fragment key={index}>{index > 0 ? <br /> : null}{line}</Fragment>)}{content.emphasis ? <>{content.lineBreak ? <br /> : " "}<em>{content.emphasis}</em></> : null}</Tag>;
}
