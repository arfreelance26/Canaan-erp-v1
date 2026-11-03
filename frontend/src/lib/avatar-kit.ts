// The DiceBear pieces the app draws with. Kept in their own module so
// lib/avatar.ts can load it on demand: the face style is ~380 KB, and it used
// to ship with every page before the first avatar was even on screen.
export { createAvatar } from "@dicebear/core";
export { notionists, shapes } from "@dicebear/collection";
