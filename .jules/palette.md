## 2024-07-25 - Preserve Existing Styles When Enhancing UX

**Learning:** When adding new utility classes for a micro-UX improvement (e.g., `active:scale-95`), it's critical to ensure that existing classes, especially those for transitions (`transition-colors`), are not accidentally removed. Overwriting the entire class attribute can lead to subtle but noticeable UI regressions, where the new enhancement works but a previous one breaks.

**Action:** In the future, I will always read the full class attribute and carefully append new classes rather than replacing the entire string. This ensures that all intended styles—both old and new—are applied correctly, preserving the UI's integrity.
