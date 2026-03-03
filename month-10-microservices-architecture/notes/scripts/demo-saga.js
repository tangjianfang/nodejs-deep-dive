/**
 * demo-saga.js
 * 编排式 Saga 模式：订单 + 库存 + 支付分布式事务（含补偿逻辑）
 */

'use strict';

const { EventEmitter } = require('events');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── 模拟微服务 ────────────────────────────────────────────────────────────────

class OrderService {
  constructor() { this._orders = new Map(); }
  async create(items) {
    await sleep(20);
    const orderId = `order_${Date.now()}`;
    this._orders.set(orderId, { id: orderId, status: 'pending', items });
    console.log(`  [OrderService] 创建订单 ${orderId}`);
    return orderId;
  }
  async confirm(orderId) {
    await sleep(10);
    const order = this._orders.get(orderId);
    if (order) { order.status = 'confirmed'; console.log(`  [OrderService] 确认订单 ${orderId}`); }
  }
  async cancel(orderId) {
    await sleep(10);
    const order = this._orders.get(orderId);
    if (order) { order.status = 'cancelled'; console.log(`  [OrderService] 补偿：取消订单 ${orderId}`); }
  }
}

class InventoryService {
  constructor() { this._stock = new Map([['itemA', 10], ['itemB', 5], ['itemC', 0]]); }
  async reserve(orderId, items) {
    await sleep(30);
    for (const { sku, qty } of items) {
      const stock = this._stock.get(sku) || 0;
      if (stock < qty) throw new Error(`库存不足: ${sku} (有 ${stock}, 需要 ${qty})`);
    }
    for (const { sku, qty } of items) {
      this._stock.set(sku, this._stock.get(sku) - qty);
    }
    console.log(`  [InventoryService] 为订单 ${orderId} 锁定库存`);
  }
  async release(orderId, items) {
    await sleep(10);
    for (const { sku, qty } of items) {
      this._stock.set(sku, (this._stock.get(sku) || 0) + qty);
    }
    console.log(`  [InventoryService] 补偿：释放订单 ${orderId} 的库存`);
  }
}

class PaymentService {
  constructor() { this._payments = new Map(); }
  async charge(orderId, amount) {
    await sleep(50);
    if (amount > 10000) throw new Error(`支付失败：金额 ${amount} 超过限额`);
    const paymentId = `pay_${Date.now()}`;
    this._payments.set(orderId, { paymentId, amount, status: 'charged' });
    console.log(`  [PaymentService] 订单 ${orderId} 支付成功 (${paymentId})`);
    return paymentId;
  }
  async refund(orderId) {
    await sleep(20);
    const payment = this._payments.get(orderId);
    if (payment) {
      payment.status = 'refunded';
      console.log(`  [PaymentService] 补偿：退款订单 ${orderId} (${payment.paymentId})`);
    }
  }
}

// ─── Saga 编排器 ───────────────────────────────────────────────────────────────

class OrderSaga {
  constructor(orderSvc, inventorySvc, paymentSvc) {
    this._order     = orderSvc;
    this._inventory = inventorySvc;
    this._payment   = paymentSvc;
  }

  async execute(items, amount) {
    const completed = []; // 记录已完成的步骤（用于补偿）
    let orderId;

    console.log('\n  >>> Saga 开始执行 <<<');

    try {
      // Step 1: 创建订单
      orderId = await this._order.create(items);
      completed.push({ step: 'create_order', orderId });

      // Step 2: 锁定库存
      await this._inventory.reserve(orderId, items);
      completed.push({ step: 'reserve_inventory', orderId, items });

      // Step 3: 执行支付
      const paymentId = await this._payment.charge(orderId, amount);
      completed.push({ step: 'charge_payment', orderId });

      // Step 4: 确认订单
      await this._order.confirm(orderId);

      console.log(`  >>> Saga 成功完成，订单: ${orderId} <<<`);
      return { success: true, orderId, paymentId };

    } catch (err) {
      console.log(`\n  >>> Saga 失败: ${err.message}，开始补偿 <<<`);
      await this._compensate(completed);
      return { success: false, error: err.message };
    }
  }

  async _compensate(completed) {
    // 逆序执行补偿事务
    for (const { step, orderId, items } of [...completed].reverse()) {
      switch (step) {
        case 'charge_payment':
          await this._payment.refund(orderId).catch(e => console.error('  退款失败:', e.message));
          break;
        case 'reserve_inventory':
          await this._inventory.release(orderId, items).catch(e => console.error('  释放库存失败:', e.message));
          break;
        case 'create_order':
          await this._order.cancel(orderId).catch(e => console.error('  取消订单失败:', e.message));
          break;
      }
    }
    console.log('  >>> 补偿完成 <<<');
  }
}

// ─── 主程序 ────────────────────────────────────────────────────────────────────

async function main() {
  const orderSvc     = new OrderService();
  const inventorySvc = new InventoryService();
  const paymentSvc   = new PaymentService();
  const saga         = new OrderSaga(orderSvc, inventorySvc, paymentSvc);

  console.log('=== Demo 1：正常 Saga（全部成功）===');
  const result1 = await saga.execute([{ sku: 'itemA', qty: 2 }, { sku: 'itemB', qty: 1 }], 500);
  console.log('结果:', result1);

  console.log('\n=== Demo 2：Saga 失败（库存不足）===');
  const result2 = await saga.execute([{ sku: 'itemC', qty: 1 }], 200); // itemC 库存为 0
  console.log('结果:', result2);

  console.log('\n=== Demo 3：Saga 失败（支付超限，已扣库存需要回滚）===');
  const result3 = await saga.execute([{ sku: 'itemA', qty: 1 }], 99999); // 超过支付限额
  console.log('结果:', result3);

  console.log('\n=== 库存状态 ===');
  console.log('itemA:', inventorySvc._stock.get('itemA'), '(初始 10, 减 2 成功 + 减 1 但回滚)');
  console.log('itemB:', inventorySvc._stock.get('itemB'), '(初始 5, 减 1 成功)');
}

main().catch(console.error);
