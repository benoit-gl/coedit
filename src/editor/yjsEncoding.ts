import * as Y from "yjs";

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  if (!value) return new Uint8Array();
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function createYDoc(encodedState: string): Y.Doc {
  const document = new Y.Doc();
  if (encodedState) Y.applyUpdate(document, base64ToBytes(encodedState), "persistence-load");
  return document;
}
