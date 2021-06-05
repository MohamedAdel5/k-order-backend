const catchAsync = require("./../utils/catchAsync");
const AppError = require("../utils/appError");
const DbQueryManager = require("../utils/dbQueryManager");
const requireConfirmed = require("../utils/requireConfirmedRestaurant"); // Requires that restaurant is confirmed by admin, if not throw an error
const filterAllowedProperties = require("../utils/filterAllowedProperties"); // Filter object to include only allowed properties


const Restaurant = require("../models/RestaurantModel");
const MenuItem = require("../models/MenuItemModel");
const Review = require("../models/ReviewModel");
const Order = require("../models/OrderModel");

// 1. Get current restaurant info
module.exports.me = catchAsync(async (req, res, next) => {
  res.status(200).json({ status: "success", user: req.user.toPublic() });
});

// [Admin] delete restaurant
module.exports.deleteRestaurant = catchAsync(async (req, res, next) => {
  let restaurantId = req.params.id;
  let restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) {
    throw new AppError("Invalid Restaurant Id", 401);
  }
  await restaurant.delete();
  res.status(200).json({ status: "deleted" });
});


// [Admin] approve/reject multiple restaurants (patch request)
module.exports.setConfirmStatusMultiple = catchAsync(async (req, res, next) => {
  let restaurantIds = req.body.map(obj => obj.id);
  let confirmStatuses = req.body.map(obj => obj.confirm_status);
  let restaurants = await Restaurant.find({ '_id': { $in: restaurantIds } });

  // Check if any of the ids is invalid
  if (restaurants.length !== restaurantIds.length) {
    let actualRestaurantIds = restaurants.map(obj => obj._id);
    let invalidIds = restaurantIds.filter(id => !actualRestaurantIds.includes(id));
    throw new AppError(`These ids are invalid : [${invalidIds}]`, 400);
  }

  if (confirmStatuses.length !== restaurantIds.length) {
    throw new AppError("Some ids does not have confirm_status", 400);
  }

  for (let i = 0; i < restaurants.length; i++) {
    let restaurant = restaurants[i];
    let confirmStatus = String(confirmStatuses[i]);
    let acceptedValues = ["true", "false", "none"];
    if (!acceptedValues.includes(confirmStatus)) {
      throw new AppError(`Accepted values are : ${acceptedValues}`, 400);
    }
    restaurant.confirmStatus = confirmStatus;
    await restaurant.save();
  }

  res.status(200).json({ status: "success" });
});

// 2. [Admin] approve/reject restaurant (patch request)
module.exports.setConfirmStatus = catchAsync(async (req, res, next) => {
  let restaurantId = req.params.id;
  let restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) {
    throw new AppError("Invalid Restaurant Id", 401);
  }
  let confirmStatus = String(req.body.confirm_status);
  let acceptedValues = ["true", "false", "none"];
  if (!acceptedValues.includes(confirmStatus)) {
    throw new AppError(`Accepted values are : ${acceptedValues}`, 400);
  }
  restaurant.confirmStatus = confirmStatus;
  await restaurant.save();
  res.status(200).json({ status: "success" });
});

// 3. [Admin] Get restaurants requests (get all restaurant documents with the field "confirmStatus" = "none" -- note that this field becomes "true" on approval and "false" on rejection)
module.exports.getRestaurantsRequests = catchAsync(async (req, res, next) => {
  let queryManager = new DbQueryManager(Restaurant.find({ confirmStatus: "none" }));
  let restaurants = await queryManager.all(req.query);

  restaurants = restaurants.map((restaurant) => {
    return restaurant.toPublic();
  });

  const totalSize = await queryManager.totalCount(req.query, Restaurant, { confirmStatus: "none" });
  res.status(200).json({ status: "success", totalSize, restaurants });
});

// 4. Get specific restaurant info
module.exports.getRestaurant = catchAsync(async (req, res, next) => {
  let restaurantId = req.params.id;
  let restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) {
    throw new AppError("Invalid Restaurant Id", 401);
  }
  await requireConfirmed(restaurantId);
  res.status(200).json({ status: "success", restaurant: restaurant.toPublic() });
});

// 5. Get menu item
module.exports.getMenuItem = catchAsync(async (req, res, next) => {
  let restaurantId = req.params.restaurant_id;
  let menuItemId = req.params.menuItem_id;

  await requireConfirmed(restaurantId);
  let menuItem = await MenuItem.findOne({ _id: menuItemId, restaurant: restaurantId });

  if (!menuItem) {
    throw new AppError("Not Found", 404);
  }

  res.status(200).json({ status: "success", menu_item: menuItem });
});

// 6. Get menu item
module.exports.getAllMenuItems = catchAsync(async (req, res, next) => {
  let restaurantId = req.params.id;
  await requireConfirmed(restaurantId);

  let queryManager = new DbQueryManager(MenuItem.find({ restaurant: restaurantId }));
  let menuItems = await queryManager.all(req.query);
  const totalSize = await queryManager.totalCount(req.query, MenuItem, { restaurant: restaurantId });

  res.status(200).json({ status: "success", totalSize, menu_items: menuItems });
});

// 7. Insert menu item
module.exports.addMenuItem = catchAsync(async (req, res, next) => {
  const { name, image, description, ingredients, availableForSale, price } = req.body;
  let menuItem = new MenuItem({
    name,
    restaurant: req.user._id,
    image,
    description,
    ingredients,
    availableForSale,
    price
  });
  menuItem = await menuItem.save();
  res.status(201).json({ status: "created", menu_item: menuItem });
});

// 8. Update menu item (price / name / description)
module.exports.updateMenuItem = catchAsync(async (req, res, next) => {
  let menuItemId = req.params.id;
  let restaurantId = req.user._id;
  let menuItem = await MenuItem.findById(menuItemId);
  if (!menuItem) {
    throw new AppError(`Menu Item with id ${menuItemId} is not found`, 404);

  }
  if (menuItem.restaurant.toString() !== restaurantId.toString()) {
    throw new AppError("You don't have permission to update this menu item", 403);
  }

  // Filter req.body to include only these properties
  const allowed = ["name", "image", "description", "ingredients", "availableForSale", "price"];
  const newMenuItem = filterAllowedProperties(req.body, allowed);

  await menuItem.updateOne(newMenuItem);

  res.status(200).json({ status: "updated" });
});

// 9. Delete menu item
module.exports.deleteMenuItem = catchAsync(async (req, res, next) => {
  let menuItemId = req.params.id;
  let restaurantId = req.user._id;
  let menuItem = await MenuItem.findById(menuItemId);
  if (!menuItem) {
    throw new AppError(`Menu Item with id ${menuItemId} is not found`, 404);

  }
  if (menuItem.restaurant.toString() !== restaurantId.toString()) {
    throw new AppError("You don't have permission to delete this menu item", 403);
  }

  await MenuItem.deleteOne({ _id: menuItemId, restaurant: restaurantId });
  res.status(200).json({ status: "deleted" });
});

// 10. get incoming orders
module.exports.getMyIncomingOrders = catchAsync(async (req, res, next) => {
  const ordersQueryManager = new DbQueryManager(Order.find({ restaurant: req.user._id }));
  let myOrders = await ordersQueryManager.all(req.query);
  const totalSize = await ordersQueryManager.totalCount(req.query, Order, { restaurant: req.user._id });

  myOrders = myOrders.map((order) => {
    return order.toPublic();
  });

  res.status(200).json({
    status: "success",
    totalSize,
    orders: myOrders,
  });
});

// 11. Set delivered status for a specific order
module.exports.changeDeliveredStatus = catchAsync(async (req, res, next) => {
  let restaurantId = req.user._id;
  let orderId = req.params.id;

  let order = await Order.findById(orderId);

  if (!order) {
    throw new AppError(`Order with id ${orderId} is not found`, 404);
  }

  if (order.restaurant.toString() !== restaurantId.toString()) {
    throw new AppError("You don't have permission to update this order", 403);
  }

  order.delivered = req.body.delivered;
  await order.save();

  res.status(200).json({ status: "updated" });
});

// 12. Get reviews of my restaurant
module.exports.getMyIncomingReviews = catchAsync(async (req, res, next) => {
  let restaurantId = req.user._id;
  let queryManager = new DbQueryManager(Review.find({ restaurant: restaurantId }));
  let reviews = await queryManager.all(req.query);

  const totalSize = await queryManager.totalCount(req.query, Review, { restaurant: restaurantId });
  res.status(200).json({ status: "success", totalSize, reviews });
});

// 13. Get reviews of specific restaurant
module.exports.getRestaurantReviews = catchAsync(async (req, res, next) => {
  let restaurantId = req.params.id;
  let queryManager = new DbQueryManager(Review.find({ restaurant: restaurantId }));
  let reviews = await queryManager.all(req.query);

  const totalSize = await queryManager.totalCount(req.query, Review, { restaurant: restaurantId });
  res.status(200).json({ status: "success", totalSize, reviews });
});

// 14. get all restaurants
module.exports.getAllRestaurants = catchAsync(async (req, res, next) => {
  let queryManager = new DbQueryManager(Restaurant.find({ confirmStatus: "true" }));
  let restaurants = await queryManager.all(req.query);

  restaurants = restaurants.map((restaurant) => {
    return restaurant.toPublic();
  });

  const totalSize = await queryManager.totalCount(req.query, Restaurant, { confirmStatus: "true" });
  res.status(200).json({ status: "success", totalSize, restaurants });
});
