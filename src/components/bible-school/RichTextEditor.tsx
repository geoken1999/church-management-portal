"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, Heading2, List, ListOrdered, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";

function Toolbar({ editor }: { editor: Editor }) {
  const items = [
    {
      label: "Bold",
      icon: Bold,
      run: () => editor.chain().focus().toggleBold().run(),
      active: editor.isActive("bold"),
    },
    {
      label: "Italic",
      icon: Italic,
      run: () => editor.chain().focus().toggleItalic().run(),
      active: editor.isActive("italic"),
    },
    {
      label: "Heading",
      icon: Heading2,
      run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      active: editor.isActive("heading", { level: 2 }),
    },
    {
      label: "Bulleted list",
      icon: List,
      run: () => editor.chain().focus().toggleBulletList().run(),
      active: editor.isActive("bulletList"),
    },
    {
      label: "Numbered list",
      icon: ListOrdered,
      run: () => editor.chain().focus().toggleOrderedList().run(),
      active: editor.isActive("orderedList"),
    },
    {
      label: "Quote",
      icon: Quote,
      run: () => editor.chain().focus().toggleBlockquote().run(),
      active: editor.isActive("blockquote"),
    },
  ];
  return (
    <div className="flex flex-wrap gap-1 border-b border-border p-1.5">
      {items.map((item) => (
        <Button
          key={item.label}
          type="button"
          size="sm"
          variant={item.active ? "secondary" : "ghost"}
          aria-label={item.label}
          title={item.label}
          onClick={item.run}
        >
          <item.icon className="size-4" />
        </Button>
      ))}
    </div>
  );
}

// A small rich-text editor for reading lessons. The server sanitizes whatever it receives, so the
// toolbar is a convenience, not a security boundary.
export function RichTextEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] } })],
    content: value,
    editorProps: {
      attributes: {
        class: "tiptap min-h-48 px-3 py-2 text-sm focus:outline-none",
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? "" : e.getHTML()),
  });
  return (
    <div className="rounded-lg border border-input">
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
