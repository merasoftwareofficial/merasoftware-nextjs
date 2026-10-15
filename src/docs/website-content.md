# Website Content management

`/admin/content` groups public website content by page and section, following the Section visuals navigation pattern. Access requires editor or admin.

Homepage sections reuse the existing HomepageImageEditor and `/api/homepage/section` saving route without storage changes. Embedded mode starts at the selected section, keeps unsaved-change protection and provides Save/Discard actions. Existing `/admin/homepage` and other direct admin URLs remain available.

Static content is listed with Not yet editable status. Non-working FAQ, testimonial and new-service forms are not presented as working editing actions. Offers now has dynamic Listing, Manage offers and universal T&C controls. Packages remains a reference group pending its own editor. Portfolio and Blog content uses the existing collection editors.

Sidebar content entries are consolidated into Website Content. Section visuals, saved Homepage variants, Blog, Portfolio, SEO, Media and operational settings remain independent. No public website content, publishing status or data storage was changed.
