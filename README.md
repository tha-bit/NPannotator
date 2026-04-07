# NPannotator

A flexible, semi-automatic **noun phrase annotation tool** for multilingual linguistic research and corpus annotation.

## Overview

NPannotator is a browser-based application designed to streamline the annotation of noun phrases across any language. It features automated tag suggestions, customizable category hierarchies, and comprehensive export capabilities.

**Key Strengths:**
- 🌍 **Language-agnostic** — annotate noun phrases in any language
- 🏷️ **Hierarchical tagging** — add or remove categories, subcategories, and types
- 🧠 **Smart suggestions** — automatically suggests tags based on previously annotated phrases
- 💾 **Flexible storage** — lexicon and annotation history stored locally (no external API required)
- 📊 **Multiple export formats** — JSON, CSV, and Excel (XLSX)
- 🔄 **Batch import** — upload CSV or Excel files for annotation

## Features

### 1. **File Upload & Setup**
- Import annotation data from **CSV** or **Excel (XLSX)** files
- Auto-detect column headers or manually assign them
- Define role mapping for data columns:
  - **Data column** (noun phrase text)
  - **Context column** (sentence or example)
  - **Language** (single language for the session)
  - **Dataset code** (corpus/source identifier)
  - **Source** (optional: document title, book reference, etc.)

### 2. **Noun Phrase Annotation**
- **Tokenization** — automatically splits phrases into tokens
- **Multi-token selection** — tag contiguous or non-contiguous sequences
- **Interactive highlighting** — see noun phrase locations within full context
- **Flexible glossing** — add word-level glosses
- **Phrase-level translation** — optional translation for the entire phrase

### 3. **Tagging System**

#### Hierarchical Tag Structure
By default, tags are organized in **three levels**:
- **Category** (e.g., NOUN, ADJ, ART, POSS, NUM, DEM, QUANT, RC, PP)
- **Subcategory** (e.g., NOUN → Animate/Inanimate)
- **Type** (e.g., NOUN-INANIM → Object/Event)

#### Auto-Suggestion
- Learns from previously tagged tokens and phrases
- Suggests tags and glosses when the **same token sequence** appears again
- Shows multiple suggestions if available
- One-click application of suggested tags

### 4. **Lexicon Management**
- **Automatic lexicon building** — lexical entries created as you annotate
- **Meaning-based organization** — multiple meanings per word with glosses
- **Phrase tracking** — each meaning records which phrases it appears in
- **Edit & review** — add/delete meanings, update glosses
- **Language-aware** — entries keyed by (language, word form) pairs
- **Empty gloss detection** — warns before export if glosses are incomplete

### 5. **Customizable Categories**
- **Add/edit categories** — create custom tag taxonomies for your project
- **Dynamic hierarchy** — add and remove categories, subcategories, and types on the fly
- **Persistent storage** — changes saved locally (no server required)
- **Export categories** — categorization system stored with your annotations

### 6. **Data Management**
- **Auto-save** — all work saved to browser local storage automatically
- **Session restore** — resume interrupted sessions with a single click
- **Clear data** — full control to wipe local storage and start fresh
- **Progress tracking** — visual indicator of annotated vs. remaining phrases

---

## Workflow

### Quick Start

1. **Load a file** → Upload your CSV or Excel file with noun phrase data
2. **Configure columns** → Map which columns contain phrases, context, language, and code
3. **Start annotating** → Select phrases and tokens to tag
4. **Add glosses** → Provide word-level glossing and translations
5. **Save phrases** → Commit annotations; they are immediately available for tag suggestions
6. **Export** → Download lexicon and annotations in your preferred format

### Example Annotation Flow

---

## Default Tag Categories

The tool comes with a comprehensive default hierarchy:

| Category | Subcategories | Types |
|----------|---------------|-------|
| **NOUN** | Animate, Inanimate | Object, Event |
| **ADJ** | Intersective, Non-intersective | Shape, Color, Material, Size, Age, Qualifier |
| **ART** | Definite, Indefinite | — |
| **POSS** | Genitive, PP-Genitive | — |
| **NUM** | Ordinal, Cardinal | — |
| **DEM** | Proximal, Distal | — |
| **QUANT** | Existential, Universal | — |
| **RC** | Restrictive, Non-restrictive | — |
| **PP** | (no subcategories) | — |

**Fully customizable** — add, edit, or delete categories as needed for your project.

---

## Export Formats

### 1. **JSON Export**
Complete annotation data in structured JSON:
- Phrases table (metadata + tag sequence)
- Tokens table (lexical info + glosses)
- Annotations table (tags, categories, token spans)

### 2. **CSV Export**
Three separate CSV files for relational database import:
- `np_phrases_*.csv` — phrase-level data
- `np_tokens_*.csv` — token-level data
- `np_annotations_*.csv` — annotation-level data

### 3. **Excel (XLSX) Export**
Single workbook with three sheets:
- **phrases** — one row per phrase
- **tokens** — one row per token
- **annotations** — one row per annotation

### 4. **Lexicon Export**
Standalone lexicon in JSON, CSV, or XLSX format:
- Lexeme ID, word form, language
- Meaning IDs with glosses
- Associated phrase IDs for each meaning

---

## Browser Storage & Privacy

- **No server** — all data stored locally in browser `localStorage`
- **No external API calls** — fully offline-capable
- **Auto-save** — annotated data automatically saved with every action
- **Session persistence** — resume sessions across browser restarts
- **Manual backup** — export to JSON/CSV/XLSX for archival

> **Note:** Clearing browser data will delete stored annotations. Export your work before clearing storage.
