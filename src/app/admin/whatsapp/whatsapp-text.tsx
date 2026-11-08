/* eslint @next/next/no-img-element: off -- previews use the existing media library URLs. */
import own from "./whatsapp.module.css";

/**
 * A WhatsApp message as the phone shows it. The backend (helpers/whatsappQueue.js messageText)
 * puts the subject on the first line as *subject*; WhatsApp shows that line bold, so the
 * admin sees bold text here too, never the asterisks.
 */
export function WhatsappText({ text, media }: { text: string; media?: { kind: "image" | "video"; url: string } }) {
  return <>{media && (media.kind === "video" ? <video src={media.url} controls preload="metadata" style={{ maxWidth: "100%", maxHeight: 240 }} /> : <img src={media.url} alt="WhatsApp media" loading="lazy" style={{ maxWidth: "100%", maxHeight: 240 }} />)}<p className={own.message}>{text.split("\n").map((line, index) => {
    const bold = /^\*([^*\n]+)\*$/.exec(line);
    return <span key={index}>{index > 0 && "\n"}{bold ? <strong className={own.bold}>{bold[1]}</strong> : line}</span>;
  })}</p></>;
}
