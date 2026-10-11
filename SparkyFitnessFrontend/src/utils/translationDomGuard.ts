/**
 * Keeps React from crashing when browser page translation (Chrome/Edge
 * "Translate this page", similar extensions) has rewritten the DOM.
 *
 * Translation replaces text nodes with its own <font> elements. React still
 * holds the original nodes, so the next update that removes or inserts next
 * to one of them throws "Failed to execute 'removeChild' on 'Node'" (or
 * 'insertBefore') and the route error boundary replaces the whole page. With
 * a German UI this happens wherever a string is still English, because that
 * is what makes the browser offer translation in the first place.
 *
 * Known React limitation, see https://github.com/facebook/react/issues/11538.
 * The guard only steps in when the node is no longer where React expects it;
 * every other call goes straight to the native implementation.
 */
export function installTranslationDomGuard(): void {
  if (typeof Node !== 'function' || !Node.prototype) return;
  const proto = Node.prototype as Node & { __translationGuard?: true };
  if (proto.__translationGuard) return;
  proto.__translationGuard = true;

  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(
    this: Node,
    child: T
  ): T {
    if (child.parentNode !== this) {
      // Already detached by the translator: the DOM is in the state React
      // wanted, so there is nothing left to remove.
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(
    this: Node,
    newNode: T,
    referenceNode: Node | null
  ): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      // The anchor was replaced by the translator. Appending keeps the new
      // content visible instead of dropping it.
      return originalInsertBefore.call(this, newNode, null) as T;
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T;
  };
}
