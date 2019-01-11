"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _classCallCheck2 = _interopRequireDefault(require("@babel/runtime/helpers/classCallCheck"));

var _possibleConstructorReturn2 = _interopRequireDefault(require("@babel/runtime/helpers/possibleConstructorReturn"));

var _getPrototypeOf3 = _interopRequireDefault(require("@babel/runtime/helpers/getPrototypeOf"));

var _inherits2 = _interopRequireDefault(require("@babel/runtime/helpers/inherits"));

var _assertThisInitialized2 = _interopRequireDefault(require("@babel/runtime/helpers/assertThisInitialized"));

var _base = _interopRequireDefault(require("./base"));

var WritesToCollectionDisallowedError =
/*#__PURE__*/
function (_BaseError) {
  (0, _inherits2.default)(WritesToCollectionDisallowedError, _BaseError);

  function WritesToCollectionDisallowedError() {
    var _getPrototypeOf2;

    var _this;

    var message = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 'This collection is configured to disallow any modifications to an existing entity or creation of new entities.';
    (0, _classCallCheck2.default)(this, WritesToCollectionDisallowedError);

    for (var _len = arguments.length, args = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
      args[_key - 1] = arguments[_key];
    }

    // Pass remaining arguments (including vendor specific ones) to parent constructor
    _this = (0, _possibleConstructorReturn2.default)(this, (_getPrototypeOf2 = (0, _getPrototypeOf3.default)(WritesToCollectionDisallowedError)).call.apply(_getPrototypeOf2, [this, message].concat(args))); // Maintains proper stack trace for where our error was thrown (only available on V8)

    if (Error.captureStackTrace) {
      Error.captureStackTrace((0, _assertThisInitialized2.default)((0, _assertThisInitialized2.default)(_this)), WritesToCollectionDisallowedError);
    } // Custom debugging information


    _this.name = 'WritesToCollectionDisallowedError';
    return _this;
  }

  return WritesToCollectionDisallowedError;
}(_base.default);

exports.default = WritesToCollectionDisallowedError;