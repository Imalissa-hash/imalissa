/**
 * Canned replies for the Social Inbox composer.
 *
 * Deliberately hard-coded rather than stored in settings: these are the
 * handful of sentences a shop repeats all day, and an editable list would
 * need its own admin screen, permission and audit path for very little value.
 * A saved reply the owner cannot find is worse than one they must edit.
 *
 * Two rules the copy follows:
 *
 * 1. No prices, stock or delivery fees. Those change, and a canned message
 *    that quotes a stale price is a promise the shop breaks — the admin
 *    fills those in per conversation.
 * 2. No URLs. The site may move to its custom domain, and a hard-coded link
 *    in a message already sent cannot be corrected afterwards.
 *
 * `label` is the short button text; `text` is what lands in the composer,
 * and it can be edited before sending — nothing here auto-sends.
 */
export const QUICK_REPLIES: { label: string; text: string }[] = [
  {
    label: "সালাম",
    text: "আসসালামু আলাইকুম। ইমালিসায় যোগাযোগ করার জন্য ধন্যবাদ। 🙏",
  },
  {
    label: "তথ্য চাই",
    text: "অর্ডার নিশ্চিত করতে দয়া করে 👤 নাম, 📞 মোবাইল নম্বর ও 📍 সম্পূর্ণ ঠিকানা পাঠান।",
  },
  {
    label: "দাম চাই",
    text: "পণ্যটির বর্তমান দাম জানতে পণ্যের নাম বা ছবিটি পাঠিয়ে দিন, আমরা জানিয়ে দেব। 🛍️",
  },
  {
    label: "ডেলিভারি",
    text: "ডেলিভারি সারা বাংলাদেশে করা হয়। আপনার এলাকার সময় ও চার্জ জানিয়ে দেব। 🚚",
  },
  {
    label: "পেমেন্ট",
    text: "পেমেন্টের অপশন রয়েছে — ক্যাশ অন ডেলিভারি, বিকাশ, নগদ ও রকেট। 💳",
  },
  {
    label: "অর্ডার নিশ্চিত",
    text: "আপনার অর্ডারটি নিশ্চিত করা হয়েছে। খুব শীঘ্রই পাঠানো হবে, ধন্যবাদ। 📦",
  },
  {
    label: "ট্র্যাক",
    text: "অর্ডারটি ট্র্যাক করতে আমাদের ওয়েবসাইটের Track Order পেজটি ব্যবহার করতে পারেন। 📦",
  },
  {
    label: "রিটার্ন",
    text: "রিটার্ন বা এক্সচেঞ্জ সম্পর্কে জানতে চাইলে বলুন, শর্তাবলী জানিয়ে দেব। 🔄",
  },
  {
    label: "আরও কিছু",
    text: "আরও কিছু জানতে চাইলে নির্দ্বিধায় জিজ্ঞাসা করুন। ❤️",
  },
  {
    label: "ধন্যবাদ",
    text: "ইমালিসা থেকে কেনা কাটার জন্য ধন্যবাদ! আবারও আসবেন। 🛒",
  },
];
