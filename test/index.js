
var Test = require('segmentio-integration-tester');
var helpers = require('./helpers');
var facade = require('segmentio-facade');
var should = require('should');
var assert = require('assert');
var Klaviyo = require('..');

describe('Klaviyo', function () {
  var settings;
  var klaviyo;
  var test;

  beforeEach(function(){
    settings = { 
      apiKey: 'hfWBjc',
      privateKey: 'pk_95773fc9a18f5728da58471d70a4dcbcdf',
      confirmOptin: true 
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
  });

  describe('mapper', function(){
    describe('identify', function(){
      it('should map basic identify', function(){
        test.maps('identify-basic', settings);
      });

      it('should fallback to anonymousId', function(){
        test.maps('identify-anonymous-id', settings);
      });

      it('should map listData if provided', function(){
        test.maps('identify-list', settings);
      });

      it('should map and override listData if options provided', function(){
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

      it('should map completed order', function() {
        test.maps('track-completed-order', settings);
      });

      it('should map completed order with urls', function() {
        test.maps('track-completed-order-urls', settings);
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
        var json = test.fixture('track-completed-order');

        test
          .set(settings)
          .track(json.input)
          .request(0)
          .query('data', json.output.order, decode)
          .expects(200)
          .end(done);
      });

      it('should sucessfully send the Ordered Product event', function(done){
        var json = test.fixture('track-completed-order');

        test
          .set(settings)
          .track(json.input)
          .request(1)
          .query('data', json.output.products[0], decode)
          .expects(200)
          .end(done);
      });

      it('should sucessfully send Order Product event for each product', function(done){
        var json = test.fixture('track-completed-order');

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
    });
  });

  describe('.identify()', function () {
    it('should perform an identify call', function(done){
      var json = test.fixture('identify-basic');
      json.output.peopleData.token = settings.apiKey;

      test
        .set(settings)
        .identify(json.input)
        .query('data', json.output.peopleData, decode)
        .expects(200);

      test.end(done);
    });

    it('should perform an identify call and add to list if provided', function(done){
      var json = test.fixture('identify-list');
      json.output.peopleData.token = settings.apiKey;
      json.output.listData.api_key = settings.privateKey;

      test
        .set(settings)
        .identify(json.input)
        .requests(2);

      test
        .request(0)
        .query('data', json.output.peopleData, decode)
        .expects(200);

      test
        .request(1)
        .sends(json.output.listData)
        .expects(200)
        .end(done);
    });

    it('should override confirmOptin setting if provided', function(done){
      var json = test.fixture('identify-list-override');
      json.output.peopleData.token = settings.apiKey;
      json.output.listData.api_key = settings.privateKey;

      test
        .set(settings)
        .identify(json.input)
        .requests(2);

      test
        .request(1)
        .sends(json.output.listData)
        .expects(200)
        .end(done);
    });

    it('should error on invalid response', function(done){
      var json = test.fixture('identify-basic');

      test
        .set({ apiKey: null })
        .identify(json.input)
        .error('bad response', done);
    });

    it('should not try to hit list api if privateKey is not provided', function(done){
      var json = test.fixture('identify-list');
      delete settings.privateKey;

      test
        .set(settings)
        .identify(json.input)
        .requests(1)
        .end(done);
    });

    it('should not try to hit list api if email is not provided', function(done){
      var json = test.fixture('identify-list');
      delete json.input.traits.email;

      test
        .set(settings)
        .identify(json.input)
        .requests(1)
        .end(done);
    });

    it('should not try to hit list api if listId is not provided', function(done){
      var json = test.fixture('identify-list');
      delete json.input.integrations.Klaviyo.listId;

      test
        .set(settings)
        .identify(json.input)
        .requests(1)
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
