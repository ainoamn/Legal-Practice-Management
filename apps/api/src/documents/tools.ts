import { Injectable } from "@nestjs/common";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as mammoth from "mammoth";
type CommandResult = { code: number; stdout: string };
export abstract class DocumentTools {
  abstract inspect(
    body: Buffer,
    filename: string,
    mime: string,
  ): Promise<{ text: string; method: string; requiresReview: boolean }>;
}
function linuxPath(path: string) {
  return process.platform === "win32"
    ? `/mnt/${path[0]!.toLowerCase()}${path.slice(2).replaceAll("\\", "/")}`
    : path;
}
export function documentCommand(
  command: string,
  args: string[],
  timeout = 90000,
  input?: Buffer,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child =
      process.platform === "win32"
        ? spawn(
            "wsl.exe",
            [
              "-d",
              process.env.DOCUMENT_TOOLS_WSL_DISTRO ?? "Ubuntu",
              "--exec",
              "timeout",
              "--kill-after=5s",
              `${Math.ceil(timeout / 1000)}s`,
              command,
              ...args,
            ],
            { windowsHide: true },
          )
        : spawn(command, args);
    child.stdin.end(input);
    let stdout = "";
    let bytes = 0;
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("DOCUMENT_TOOL_TIMEOUT"));
    }, timeout);
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 4000000) {
        child.kill();
        reject(new Error("EXTRACTION_LIMIT"));
      } else stdout += chunk.toString("utf8");
    });
    child.stderr.resume();
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout });
    });
  });
}
@Injectable()
export class LocalDocumentTools extends DocumentTools {
  async inspect(body: Buffer, filename: string, mime: string) {
    const dir = await mkdtemp(join(tmpdir(), "legal-document-"));
    const file = join(
      dir,
      "input" +
        (filename.includes(".")
          ? "." + filename.split(".").pop()!.toLowerCase()
          : ".txt"),
    );
    try {
      const scanned = await documentCommand(
        "clamscan",
        [
          "--no-summary",
          "--max-filesize=25M",
          "--max-scansize=100M",
          "--max-recursion=20",
          "--alert-exceeds-max=yes",
          "-",
        ],
        90000,
        body,
      );
      if (scanned.code === 1) throw new Error("MALWARE_DETECTED");
      if (scanned.code !== 0) throw new Error("SCANNER_UNAVAILABLE");
      await writeFile(file, body, { mode: 0o600 });
      if (mime === "text/plain")
        return {
          text: body.toString("utf8").slice(0, 200000),
          method: "TEXT",
          requiresReview: false,
        };
      if (
        mime ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        const result = await mammoth.extractRawText({ buffer: body });
        return {
          text: result.value.slice(0, 200000),
          method: "DOCX",
          requiresReview: true,
        };
      }
      if (mime === "application/pdf") {
        const plain = join(dir, "extracted.txt");
        const result = await documentCommand("pdftotext", [
          "-f",
          "1",
          "-l",
          "50",
          "-enc",
          "UTF-8",
          linuxPath(file),
          linuxPath(plain),
        ]);
        if (result.code !== 0) throw new Error("EXTRACTION_FAILED");
        const text = await readFile(plain, "utf8");
        if (text.trim().length > 40)
          return {
            text: text.slice(0, 200000),
            method: "PDF_TEXT",
            requiresReview: true,
          };
        const prefix = join(dir, "page");
        const raster = await documentCommand(
          "pdftoppm",
          [
            "-f",
            "1",
            "-l",
            "20",
            "-scale-to",
            "1800",
            "-png",
            linuxPath(file),
            linuxPath(prefix),
          ],
          120000,
        );
        if (raster.code !== 0) throw new Error("OCR_FAILED");
        const { readdir } = await import("node:fs/promises");
        let extracted = "";
        for (const image of (await readdir(dir))
          .filter((name) => /^page-\d+\.png$/.test(name))
          .sort())
          extracted += (await this.ocr(join(dir, image))) + "\n\n";
        return {
          text: extracted.slice(0, 200000),
          method: "OCR_ARA_ENG_FIRST_20_PAGES",
          requiresReview: true,
        };
      }
      if (mime.startsWith("image/"))
        return {
          text: (await this.ocr(file)).slice(0, 200000),
          method: "OCR_ARA_ENG",
          requiresReview: true,
        };
      return { text: "", method: "BINARY_NO_EXTRACTION", requiresReview: true };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
  private async ocr(file: string) {
    const result = await documentCommand("tesseract", [
      linuxPath(file),
      "stdout",
      "-l",
      "ara+eng",
    ]);
    if (result.code !== 0) throw new Error("OCR_FAILED");
    return result.stdout;
  }
}
export function validateDocumentFile(body: Buffer, filename: string) {
  const extension = filename.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    tif: "image/tiff",
    tiff: "image/tiff",
    txt: "text/plain",
  };
  if (
    !extension ||
    !types[extension] ||
    !body.length ||
    body.length > 25 * 1024 * 1024
  )
    throw new Error("INVALID_FILE");
  const magic = body.subarray(0, 8);
  if (extension === "pdf" && !body.subarray(0, 5).equals(Buffer.from("%PDF-")))
    throw new Error("FILE_TYPE_MISMATCH");
  if (
    ["docx", "xlsx", "pptx"].includes(extension) &&
    !magic.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 3, 4]))
  )
    throw new Error("FILE_TYPE_MISMATCH");
  if (
    extension === "png" &&
    !magic.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw new Error("FILE_TYPE_MISMATCH");
  if (
    ["jpg", "jpeg"].includes(extension) &&
    !(body[0] === 255 && body[1] === 216 && body[2] === 255)
  )
    throw new Error("FILE_TYPE_MISMATCH");
  if (
    ["tif", "tiff"].includes(extension) &&
    !["49492a00", "4d4d002a"].includes(magic.subarray(0, 4).toString("hex"))
  )
    throw new Error("FILE_TYPE_MISMATCH");
  if (extension === "txt") {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    decoder.decode(body);
    if (body.includes(0)) throw new Error("INVALID_FILE");
  }
  return types[extension]!;
}
