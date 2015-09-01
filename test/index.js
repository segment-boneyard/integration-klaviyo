
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
    settings = { apiKey: 'hfWBjc' };
    klaviyo = new Klaviyo(settings);
    test = Test(klaviyo, __dirname);
  });

  it('should have correct settings', function(){
    test
      .name('Klaviyo')
      .endpoint('http://a.klaviyo.com/api')
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
        .error('Klaviyo: bad response', done);
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
          .expects(200);

        test.end(done);
      });
    });
  });

  describe('.identify()', function () {
    it('should be able to identify correctly', function(done){
      test
        .set(settings)
        .identify(helpers.identify())
        .expects(200)
        .end(done);
    });

    it('should error on invalid response', function(done){
      test
        .set({ apiKey: null })
        .identify(helpers.identify())
        .error('Klaviyo: bad response', done);
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
