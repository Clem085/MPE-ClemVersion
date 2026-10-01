# Preview appearance fixture

Paragraph with **bold**, _italic_, `inline code`, and a [link](https://example.com).

> Blockquote

| Mode  | Result   |
| ----- | -------- |
| Light | Readable |
| Dark  | Readable |

```bash
sudo apt update
git status
```

```typescript
const appearance: 'light' | 'dark' = 'dark';
```

```mermaid
flowchart LR
    A[Request] --> B{Approved?}
    B -->|Yes| C[Install]
    B -->|No| D[Reject]
```

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#7c3aed","primaryTextColor":"#ffffff"}}}%%
flowchart LR
    A[Author styled] --> B[Still author styled]
    classDef custom fill:#7c3aed,stroke:#facc15,color:#ffffff
    class A custom
    style B fill:#be123c,stroke:#fef08a,color:#ffffff
```

---
