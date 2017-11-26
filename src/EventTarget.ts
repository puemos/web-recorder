export class EventTarget {
  private eventTarget: DocumentFragment

  constructor() {
    this.eventTarget = document.createDocumentFragment()
  }

  addEventListener(type: string, listener: EventListener): void {
    return this.eventTarget.addEventListener(type, listener)
  }

  removeEventListener(type: string, listener: EventListener): void {
    return this.eventTarget.removeEventListener(type, listener)
  }

  dispatchEvent(event: Event): boolean {
    return this.eventTarget.dispatchEvent(event)
  }
}
