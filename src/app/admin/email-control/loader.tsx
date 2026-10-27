import styles from "./email-control.module.css";

/** The small loader that stands where live data will appear; the rest of the panel is already drawn. */
export function Loader({ label = "", inline = false }: { label?: string; inline?: boolean }) {
  const Tag = inline ? "span" : "p";
  return <Tag className={styles.loading} role="status" aria-label={label || "Loading"}><span className={styles.spinner} aria-hidden="true" />{label}</Tag>;
}
