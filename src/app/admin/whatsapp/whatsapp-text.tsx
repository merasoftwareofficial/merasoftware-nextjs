import own from "./whatsapp.module.css";

/**
 * A WhatsApp message as the phone shows it. The backend (helpers/whatsappQueue.js messageText)
 * puts the subject on the first line as *subject*; WhatsApp shows that line bold, so the
 * admin sees bold text here too, never the asterisks.
 */
export function WhatsappText({ text }: { text: string }) {
  return <p className={own.message}>{text.split("\n").map((line, index) => {
    const bold = /^\*([^*\n]+)\*$/.exec(line);
    return <span key={index}>{index > 0 && "\n"}{bold ? <strong className={own.bold}>{bold[1]}</strong> : line}</span>;
  })}</p>;
}
