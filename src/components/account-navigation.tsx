import Link from "@/components/link";
import styles from "./account-navigation.module.css";

export function accountLinks(username: string) {
  return [
    { href: "/account", label: "Overview", description: "Your personal account shortcuts." },
    { href: `/members/${username}`, label: "My profile", description: "View your public community profile." },
    { href: "/account/posts", label: "My posts", description: "Find your drafts, submissions and published posts." },
    { href: "/account/offers", label: "My offers", description: "View your reserved offers and payment deadlines." },
    { href: "/account/saved", label: "Saved posts", description: "Return to articles you saved for later." },
    { href: "/subscribe/manage", label: "Notification preferences", description: "Choose your topics and notification channels." },
  ];
}

export function AccountNavigation({ username, active }: { username: string; active: string }) {
  return (
    <nav className={styles.navigation} aria-label="My Account">
      {accountLinks(username).map(item => (
        <Link key={item.href} href={item.href} aria-current={active === item.href ? "page" : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function AccountOverview({ username }: { username: string }) {
  return (
    <div className={styles.grid}>
      {accountLinks(username).filter(item => item.href !== "/account").map(item => (
        <Link className={styles.card} key={item.href} href={item.href}>
          <h2>{item.label} <span aria-hidden="true">↗</span></h2>
          <p>{item.description}</p>
        </Link>
      ))}
    </div>
  );
}
