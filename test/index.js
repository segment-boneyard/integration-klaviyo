
var Test = require('segmentio-integration-tester');
var helpers = require('./helpers');
var facade = require('segmentio-facade');
var should = require('should');
var assert = require('assert');
var randomString = require('randomstring').generate;
var uuid = require('uuid').v4;
var Klaviyo = require('..');

describe('Klaviyo', function () {
  var settings;
  var klaviyo;
  var test;

  beforeEach(function(){
    settings = {
      apiKey: 'hfWBjc',
      privateKey: 'pk_95773fc9a18f5728da58471d70a4dcbcdf',
      confirmOptin: false,
      listId: 'FHAHL2',
      sendAnonymous: true
    };
    klaviyo = new Klaviyo(settings);
    test = Test(klaviyo, __dirname);
  });

  it('should have correct settings', function(){
    test
      .name('Klaviyo')
      .endpoint('https://a.klaviyo.com/api')
      .ensure('settings.apiKey')
      .channels(['server']);
  });

  describe('.validate()', function () {
    it('should be invalid when .apiKey is missing', function(){
      delete settings.apiKey;
      test.invalid({}, settings);
    });

    it('should be valid when given complete settings', function(){
      test.valid({}, settings);
    });

    it('should require userid if sendAnonymous is false', function() {
      settings.sendAnonymous = false;
      test.valid({ userId: '123' }, settings);
      test.invalid({}, settings);
    })
  });

  describe('mapper', function(){
    describe('identify', function(){
      it('should map basic identify', function(){
        delete settings.listId;
        test.maps('identify-basic', settings);
      });

      it('should fallback to anonymousId', function(){
        delete settings.listId;
        test.maps('identify-anonymous-id', settings);
      });

      it('should map list data if provided', function(){
        test.maps('identify-list', settings);
      });

      it('should map and override list data if options provided', function(){
        test.maps('identify-list-override', settings);
      });
    });

    describe('track', function(){
      it('should map basic track', function(){
        test.maps('track-basic', settings);
      });

      it('should map orderId to $eventId', function(){
        test.maps('track-orderId', settings);
      });

      it('should map eventId to $eventId', function(){
        test.maps('track-eventId', settings);
      });

      it('should map order completed', function() {
        test.maps('track-order-completed', settings);
      });

      it('should map order completed with urls', function() {
        test.maps('track-order-completed-urls', settings);
      });

      it('should map order completed with custom props', function() {
        test.maps('track-order-completed-custom', settings);
      });
    });
  });

  describe('.track()', function () {
    it('should be able to track correctly', function(done){
      test
        .set(settings)
        .track(helpers.track())
        .expects(200)
        .end(done);
    });

    it('should error on invalid response', function(done){
      test
        .set({ apiKey: null })
        .track(helpers.track())
        .error('bad response', done);
    });

    describe('.completedOrder()', function(){
      it('should successfully send the Placed Order event', function(done){
        var json = test.fixture('track-order-completed');

        test
          .set(settings)
          .track(json.input)
          .request(0)
          .query('data', json.output.order, decode)
          .expects(200)
          .end(done);
      });

      it('should sucessfully send the Ordered Product event', function(done){
        var json = test.fixture('track-order-completed');

        test
          .set(settings)
          .track(json.input)
          .request(1)
          .query('data', json.output.products[0], decode)
          .expects(200)
          .end(done);
      });

      it('should sucessfully send Order Product event for each product', function(done){
        var json = test.fixture('track-order-completed');

        test
          .set(settings)
          .track(json.input)
          .requests(3);

        test
          .request(1)
          .query('data', json.output.products[0], decode)
          .expects(200);

        test
          .request(2)
          .query('data', json.output.products[1], decode)
          .expects(200)
          .end(done);
      });

      it('should let custom properties pass for order completed', function(done){
        var json = test.fixture('track-order-completed-custom');

        test
          .set(settings)
          .track(json.input)
          .request(0)
          .query('data', json.output.order, decode)
          .expects(200)
          .end(done);
      });
    });
  });

  describe('.identify()', function () {
    it('should perform an identify call', function(done){
      var json = test.fixture('identify-basic');
      json.output.token = settings.apiKey;
      delete settings.listId;

      test
        .set(settings)
        .identify(json.input)
        .query('data', {
          token: json.output.token,
          properties: json.output.properties
        }, decode)
        .expects(200);

      test.end(done);
    });

    it('should add to list if provided', function(done){
      var json = test.fixture('identify-list');
      json.output.token = settings.apiKey;
      json.output.apiKey = settings.privateKey;

      test
        .set(settings)
        .identify(json.input)
        .sends({
          api_key: json.output.apiKey,
          email: json.output.email,
          properties: JSON.stringify(json.output.properties),
          confirm_optin: json.output.confirmOptIn
        })
        .expects(200)
        .end(done);
    });

    it.only('should add to list and identify if not already in list', function(done){
      var json = test.fixture('identify-list-new');
      json.output.token = settings.apiKey;
      json.output.apiKey = settings.privateKey;

      // create random user
      var random = randomIdAndEmail();
      var id = random.id;
      var email = random.email;

      // yikes
      json.input.userId = id;
      json.input.traits.email = email;
      json.output.email = email;
      json.output.properties.$id = id;
      json.output.properties.id = id;
      json.output.properties.$email = email;
      json.output.properties.email = email;

      // ensure that, because this is a new user, we identify after adding to list
      test
        .set(settings)
        .identify(json.input)
        .requests(2)

      test
        .request(0)
        .sends({
          api_key: json.output.apiKey,
          email: json.output.email,
          properties: json.output.properties,
          confirm_optin: json.output.confirmOptIn
        })
        .expects(200);

      test
        .request(1)
        .query('data', {
          token: json.output.token,
          properties: json.output.properties
        }, decode)
        .expects(200);

      test.end(done);
    });

    it('should override confirmOptin and listId setting if manually provided', function(done){
      var json = test.fixture('identify-list-override');
      delete settings.listId;
      json.output.token = settings.apiKey;
      json.output.apiKey = settings.privateKey;

      test
        .set(settings)
        .identify(json.input)
        .sends({
          api_key: json.output.apiKey,
          email: json.output.email,
          properties: JSON.stringify(json.output.properties),
          confirm_optin: json.output.confirmOptIn
        })
        .expects(200)
        .end(done);
    });

    it('should error on invalid response', function(done){
      var json = test.fixture('identify-basic');
      settings.apiKey = null;
      delete settings.listId; // force identify

      test
        .set(settings)
        .identify(json.input)
        .error('bad response', done);
    });

    it('should not try to hit list api if privateKey is not provided', function(done){
      var json = test.fixture('identify-list');
      delete settings.privateKey;

      test
        .set(settings)
        .identify(json.input)
        .query('data', {
          token: json.output.token,
          properties: json.output.properties
        }, decode)
        .expects(200)
        .end(done);
    });

    it('should not try to hit list api if email is not provided', function(done){
      var json = test.fixture('identify-list');
      delete json.input.traits.email;
      delete json.output.properties.email;
      delete json.output.properties.$email;

      test
        .set(settings)
        .identify(json.input)
        .query('data', {
          token: json.output.token,
          properties: json.output.properties
        }, decode)
        .expects(200)
        .end(done);
    });

    it('should not try to hit list api if listId is not provided', function(done){
      var json = test.fixture('identify-list');
      delete settings.listId;

      test
        .set(settings)
        .identify(json.input)
        .query('data', {
          token: json.output.token,
          properties: json.output.properties
        }, decode)
        .expects(200)
        .end(done);
    });
  });
});

/**
 * Decode base64 and parse json
 *
 * @param {Object} data
 * @return {Object} decoded payload
 * @api private
 */

function decode(data){
  var buf = new Buffer(data, 'base64');
  return JSON.parse(buf.toString());
}

/**
 * Return random id and email
 * @return {Object} { id, email }
 */

function randomIdAndEmail() {
  return {
    id: uuid(),
    email: 'chris+' + randomString(8) + '@sperand.io'
  }
}
