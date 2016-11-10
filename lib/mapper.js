/**
 * Module dependencies.
 */

var extend = require('extend');
var time = require('unix-time');
var Track = require('segmentio-facade').Track;
var reject = require('reject');
var remove = require('obj-case').del;

/**
 * Map identify.
 *
 * https://www.klaviyo.com/docs#people-special
 *
 * @param {Identify} identify
 * @return {Object}
 * @api private
 */

exports.identify = function(identify) {
  var opts = identify.options(this.name);
  var listId = opts.listId || this.settings.listId;
  var confirmOptIn = this.settings.confirmOptin;

  // allow explicit per-message override
  if (opts.confirmOptin !== undefined) confirmOptIn = opts.confirmOptin;

  return {
    token: this.settings.apiKey,
    properties: traits(identify),
    email: identify.email(),
    apiKey: this.settings.privateKey,
    confirmOptIn: confirmOptIn,
    listId: listId
  };
};

/**
 * Map track.
 *
 * Klaviyo's special properties, apparently undocumented :(
 *
 * @param {Track} track
 * @return {Object}
 * @api private
 */

exports.track = function(track) {
  return {
    token: this.settings.apiKey,
    event: track.event(),
    properties: properties(track),
    time: time(track.timestamp()),
    customer_properties: {
      $id: track.userId() || track.sessionId(),
      $email: track.email()
    }
  };
};

/**
 * Map Order Completed
 *
 * Docs: http://learn.klaviyo.com/12887-Ecommerce:-Other-Integrations/product-activity-integrating-a-custom-ecommerce-cart-or-platform
 *
 * @param {Track} track
 * @return {Object} Returns an object with two properties: .order (Object) and .products (Object[]). Each individual object should be sent in its own call to Klaviyo's API.
 * @api private
 */

exports.orderCompleted = function(track, settings) {
  var products = track.products();
  var orderId = track.orderId();
  var categories = formatCategories(products);
  var productNames = formatNames(products);
  var items = formatItems(products);
  var payloads = {};

  payloads.order = {
    token: settings.apiKey,
    event: 'Placed Order',
    time: time(track.timestamp())
  };

  payloads.order.customer_properties = {
    $id: track.userId() || track.sessionId()
  };

  payloads.order.properties = {
    $event_id: orderId,
    $value: track.revenue(),
    Categories: categories,
    'Item Names': productNames,
    'Items': items
  };

  var whitelist = [
    '$event_id',
    '$value',
    'orderId',
    'order_id',
    'categories',
    'item names',
    'items',
    'revenue',
    'total',
    'products'
  ];
  // strip standard props and leave custom props only
  var topLevelCustomProps = filter(track, whitelist);

  // merge custom props
  payloads.order.properties = extend(payloads.order.properties, topLevelCustomProps);

  payloads.products = products.map(function(item) {
    var product = new Track({properties: item});
    var productPayload = {
      token: settings.apiKey,
      event: 'Ordered Product',
      time: time(track.timestamp())
    };
    var itemWhitelist = [
      '$event_id',
      '$value',
      'name',
      'product categories',
      'category',
      'id',
      'productId',
      'product_id',
      'sku',
      'quantity',
      'price',
      'product url',
      'productUrl',
      'image url',
      'imageUrl'
    ];
    // filter standard item props so we can merge custom props later
    var itemCustomProps = filter(product, itemWhitelist);

    productPayload.customer_properties = {
      $id: track.userId() || track.sessionId()
    };

    productPayload.properties = {
      $value: product.price(),
      Name: product.name(),
      Quantity: product.quantity(),
      "Product Categories": [product.category()],
      SKU: product.sku()
    };

    // ensure unique $event_id is associated with each Ordered Product event by combining Order Completed order_id and product's productId or SKU
    var identifier = product.productId() || product.id() || product.sku();
    productPayload.properties.$event_id = orderId + '_' + identifier;

    productPayload.properties = extend(productPayload.properties, itemCustomProps);

    if (product.proxy('properties.productUrl')) productPayload.properties['Product URL'] = product.proxy('properties.productUrl');
    if (product.proxy('properties.imageUrl')) productPayload.properties['Image URL'] = product.proxy('properties.imageUrl');

    return productPayload;
  });

  return payloads;
};

/**
 * Return only custom properties
 *
 * @param {Object, Array} facade, list
 * @return {Object}
 * @api private
 */

function filter(facade, list) {
  var ret = facade.properties();
  for (var x = 0; x < list.length; x++) {
    remove(ret, list[x]);
  }
  return ret;
}

/**
 * Format categories of products.
 *
 * @param {Array} products
 * @return {Array}
 * @api private
 */

function formatCategories(products) {
  var categories = products.map(function (item) {
    var product = new Track({properties: item});
    return product.category();
  });
  return categories;
}

/**
 * Format names of products.
 *
 * @param {Array} products
 * @return {Array}
 * @api private
 */

function formatNames(products) {
  var names = products.map(function (item) {
    var product = new Track({properties: item});
    return product.name();
  });
  return names;
}

/**
 * Format products array.
 *
 * @param {Array} products
 * @return {Array}
 * @api private
 */

function formatItems(products) {
  var items = products.map(function (item) {
    var product = new Track({properties: item});
    var payload = {};
    var whitelist = [
      'sku',
      'name',
      'quantity',
      'item price',
      'price',
      'row total',
      'categories',
      'category',
      'image url',
      'imageUrl',
      'product url',
      'productUrl'
    ];
    // filter standard traits to merge custom props later
    var customProps = filter(product, whitelist);

    payload.SKU = product.sku();
    payload.Name = product.name();
    payload.Quantity = product.quantity();
    payload['Item Price'] = product.price();
    payload['Row Total'] = product.price();
    payload.Categories = [product.category()];

    if (product.proxy('properties.productUrl')) payload['Product URL'] = product.proxy('properties.productUrl');
    if (product.proxy('properties.imageUrl')) payload['Image URL'] = product.proxy('properties.imageUrl');

    return extend(payload, customProps);
  });
  return items;
}

/**
 * Format track properties.
 *
 * Populate $event_id via `properties.eventId` alias,
 * falling back to a copy of `properties.orderId`.
 *
 * If neither is present, omit from payload.
 *
 * @param {Track} track
 * @return {Object}
 * @api private
 */

function properties(track) {
  return extend(track.properties({
    'eventId': '$event_id'
  }), {
    $value: track.revenue(),
    $event_id: track.orderId()
  });
}

/**
 * Format traits.
 * https://www.klaviyo.com/docs/api/people
 * @param {Identify} identify
 * @return {Object}
 * @api private
 */

function traits(identify) {
  var traits = identify.traits();
  // why are we extending and not removing duplicate traits here?
  return reject(extend(traits, {
    $id: identify.userId() || identify.sessionId(),
    $email: identify.email(),
    $first_name: identify.firstName(),
    $last_name: identify.lastName(),
    $phone_number: identify.phone(),
    $title: identify.proxy('traits.title') || identify.position(),
    $organization: identify.proxy('traits.organization'),
    $city: identify.city(),
    $region: identify.region() || identify.state(),
    $country: identify.country(),
    $timezone: identify.timezone(),
    $zip: identify.zip()
  }));
}
