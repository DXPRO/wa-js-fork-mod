/*!
 * Copyright 2026 WPPConnect Team
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

interface ProgrammaticMessageData {
  to: string;
  timestamp: number;
}

const programmaticMessages = new Map<string, ProgrammaticMessageData>();

/**
 * Registra o ID de uma mensagem gerada programaticamente.
 */
export function addProgrammaticMessage(id: string, to: string) {
  programmaticMessages.set(id, {
    to,
    timestamp: Date.now(),
  });

  // Limpeza automática após 2 minutos para evitar vazamento de memória (TTL)
  setTimeout(() => {
    programmaticMessages.delete(id);
  }, 120000);
}

/**
 * Verifica se a mensagem foi enviada de forma programática.
 */
export function isProgrammaticMessage(id?: string | null): boolean {
  if (!id) return false;
  return programmaticMessages.has(id);
}

/**
 * Verifica se há mensagens programáticas ativas destinadas a um determinado chat.
 */
export function hasActiveProgrammaticMessageForChat(
  chatId?: string | null
): boolean {
  if (!chatId) return false;

  const now = Date.now();
  // Limpeza preventiva de mensagens expiradas no mapa
  const expiredIds: string[] = [];
  for (const [id, data] of programmaticMessages.entries()) {
    if (now - data.timestamp > 120000) {
      expiredIds.push(id);
    }
  }
  for (const id of expiredIds) {
    programmaticMessages.delete(id);
  }

  for (const data of programmaticMessages.values()) {
    if (data.to === chatId) {
      return true;
    }
  }
  return false;
}

let programmaticLinkPreviewCount = 0;

/**
 * Incrementa o contador de link previews programáticos ativos.
 */
export function startProgrammaticLinkPreview() {
  programmaticLinkPreviewCount++;
}

/**
 * Decrementa o contador de link previews programáticos ativos.
 */
export function endProgrammaticLinkPreview() {
  programmaticLinkPreviewCount = Math.max(0, programmaticLinkPreviewCount - 1);
}

/**
 * Retorna se há um link preview programático ativo.
 */
export function isProgrammaticLinkPreview(): boolean {
  return programmaticLinkPreviewCount > 0;
}
