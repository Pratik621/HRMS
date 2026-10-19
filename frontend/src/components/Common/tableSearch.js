import { Children, isValidElement } from 'react';

// Read display text without invoking components or indexing hidden data/attributes.
export function tableSearchText(node) {
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (!node || typeof node === 'boolean') return '';
    if (Array.isArray(node)) return node.map(tableSearchText).join(' ');
    if (!isValidElement(node)) return '';
    if (['button', 'svg', 'script', 'style'].includes(node.type) || node.props['aria-hidden'] === true) return '';
    if (node.type === 'input' || node.type === 'textarea') {
        return node.props.type === 'password' ? '' : String(node.props.value ?? node.props.defaultValue ?? '');
    }
    return Children.toArray(node.props.children).map(tableSearchText).join(' ');
}
export function filterTableRows(rows, query) {
    const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return rows;
    return rows.filter(row => {
        const text = tableSearchText(row).toLocaleLowerCase();
        return words.every(word => text.includes(word));
    });
}
