import mammoth from 'mammoth'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorkerSrc

function getFileExtension(fileName: string): string {
  const trimmed = String(fileName ?? '').trim().toLowerCase()
  const lastDot = trimmed.lastIndexOf('.')
  return lastDot >= 0 ? trimmed.slice(lastDot) : ''
}

function extractTextFromRtf(rawRtf: string): string {
  const input = String(rawRtf ?? '')
  const decoder = new TextDecoder('windows-1252')
  const punctuationMap: Record<string, string> = {
    emdash: '—',
    endash: '–',
    bullet: '•',
    lquote: '‘',
    rquote: '’',
    ldblquote: '“',
    rdblquote: '”',
  }
  const ignorableDestinations = new Set([
    'fonttbl',
    'colortbl',
    'stylesheet',
    'listtable',
    'listoverridetable',
    'generator',
    'info',
    'pict',
    'object',
    'objdata',
    'datastore',
    'themedata',
    'xmlnstbl',
    'xmlopen',
    'xmlattrname',
    'xmlattrvalue',
    'xmlclose',
  ])

  const groupIgnoreStack: boolean[] = [false]
  let output = ''
  let i = 0
  let skipAnsiFallback = 0
  let unicodeAnsiFallbackLength = 1
  let markNextGroupAsIgnorable = false
  let skipBinaryChars = 0

  const currentGroupIgnored = (): boolean => groupIgnoreStack[groupIgnoreStack.length - 1] === true
  const setCurrentGroupIgnored = (value: boolean): void => {
    groupIgnoreStack[groupIgnoreStack.length - 1] = value
  }

  while (i < input.length) {
    if (skipBinaryChars > 0) {
      skipBinaryChars -= 1
      i += 1
      continue
    }

    const ch = input[i]

    if (ch === '{') {
      const parentIgnored = currentGroupIgnored()
      groupIgnoreStack.push(parentIgnored || markNextGroupAsIgnorable)
      markNextGroupAsIgnorable = false
      i += 1
      continue
    }

    if (ch === '}') {
      if (groupIgnoreStack.length > 1) {
        groupIgnoreStack.pop()
      }
      i += 1
      continue
    }

    if (ch === '\\') {
      const next = input[i + 1]
      if (!next) {
        i += 1
        continue
      }

      if (next === '\\' || next === '{' || next === '}') {
        if (!currentGroupIgnored()) {
          output += next
        }
        i += 2
        continue
      }

      if (next === '*') {
        markNextGroupAsIgnorable = true
        i += 2
        continue
      }

      if (next === '\'') {
        const hex = input.slice(i + 2, i + 4)
        if (/^[0-9a-fA-F]{2}$/.test(hex) && !currentGroupIgnored()) {
          const byte = Number.parseInt(hex, 16)
          output += decoder.decode(new Uint8Array([byte]))
        }
        i += 4
        continue
      }

      if (/[a-zA-Z]/.test(next)) {
        let j = i + 1
        while (j < input.length && /[a-zA-Z]/.test(input[j])) {
          j += 1
        }
        const word = input.slice(i + 1, j)

        let sign = 1
        if (input[j] === '-') {
          sign = -1
          j += 1
        }

        let numberText = ''
        while (j < input.length && /\d/.test(input[j])) {
          numberText += input[j]
          j += 1
        }

        const hasNumber = numberText.length > 0
        const numberValue = hasNumber ? sign * Number.parseInt(numberText, 10) : null

        if (input[j] === ' ') {
          j += 1
        }

        if (word === 'par' || word === 'line') {
          if (!currentGroupIgnored()) {
            output += '\n'
          }
        } else if (word === 'tab') {
          if (!currentGroupIgnored()) {
            output += '\t'
          }
        } else if (word === 'u' && numberValue !== null) {
          if (!currentGroupIgnored()) {
            const normalized = numberValue < 0 ? 65536 + numberValue : numberValue
            output += String.fromCodePoint(normalized)
          }
          skipAnsiFallback = unicodeAnsiFallbackLength
        } else if (word === 'uc' && numberValue !== null) {
          unicodeAnsiFallbackLength = Math.max(0, numberValue)
        } else if (word === 'bin' && numberValue !== null) {
          skipBinaryChars = Math.max(0, numberValue)
        } else if (ignorableDestinations.has(word)) {
          setCurrentGroupIgnored(true)
        } else if (punctuationMap[word]) {
          if (!currentGroupIgnored()) {
            output += punctuationMap[word]
          }
        }

        i = j
        continue
      }

      if (!currentGroupIgnored()) {
        output += next
      }
      i += 2
      continue
    }

    if (skipAnsiFallback > 0) {
      skipAnsiFallback -= 1
      i += 1
      continue
    }

    if (!currentGroupIgnored()) {
      output += ch
    }
    i += 1
  }

  return output
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/\b[0-9a-fA-F]{24,}\b/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[;\s\u25cf\u25cb\u25a0]{6,}\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = getDocument({ data: arrayBuffer })
  const pdf = await loadingTask.promise
  const pagesText: string[] = []

  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    const pageText = textContent.items
      .map((item) => ('str' in item ? String(item.str ?? '') : ''))
      .join(' ')
      .trim()

    if (pageText.length > 0) {
      pagesText.push(pageText)
    }
  }

  return pagesText.join('\n\n')
}

async function extractTextFromDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return String(result.value ?? '').trim()
}

/** ~2 pages of text — enough for resume matching without excess memory/token cost */
const RESUME_MAX_CHARS = 6000

function truncateResume(text: string): string {
  const trimmed = text.trim()
  return trimmed.length > RESUME_MAX_CHARS ? trimmed.slice(0, RESUME_MAX_CHARS) : trimmed
}

export async function extractTextFromFile(file: File): Promise<string> {
  const extension = getFileExtension(file.name)

  if (extension === '.txt') {
    return truncateResume(await file.text())
  }

  if (extension === '.rtf') {
    return truncateResume(extractTextFromRtf(await file.text()))
  }

  if (extension === '.pdf') {
    return truncateResume(await extractTextFromPdf(file))
  }

  if (extension === '.docx') {
    return truncateResume(await extractTextFromDocx(file))
  }

  throw new Error('Unsupported file type. Please upload .txt, .pdf, .docx, or .rtf')
}
