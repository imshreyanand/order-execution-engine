import EventEmitter from 'events';

class PubSub extends EventEmitter {
  // Topic format: order:<orderId>
  publishOrder(orderId: string, message: any) {
    const topic = `order:${orderId}`;
    this.emit(topic, message);
  }

  subscribeOrder(orderId: string, handler: (message: any) => void) {
    const topic = `order:${orderId}`;
    this.on(topic, handler);
    return () => this.off(topic, handler);
  }
}

export const pubsub = new PubSub();
export default pubsub;
