import fs from "fs";
import path from "path";
import { DocumentRecord } from "./world";

const DATA_DIR = path.join(process.cwd(), "data");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function saveDocument(record: DocumentRecord) {
  const filePath = path.join(DATA_DIR, `${record.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2));
}

export function getDocument(id: string): DocumentRecord | null {
  const filePath = path.join(DATA_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as DocumentRecord;
}

export function listDocuments(): DocumentRecord[] {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith(".json"));
  return files.map(f => getDocument(f.replace(".json", ""))!).filter(Boolean);
}