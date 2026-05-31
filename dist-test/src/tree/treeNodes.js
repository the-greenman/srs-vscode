"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.groupLabel = groupLabel;
// Build the display label for a group: show count only when > 0
function groupLabel(label, count) {
    return count > 0 ? `${label} (${count})` : label;
}
//# sourceMappingURL=treeNodes.js.map