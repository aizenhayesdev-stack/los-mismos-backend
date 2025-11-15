import RouteModel from "../models/route.model";
import Destination from "../models/destinations.model";

/**
 * Calculate fare based on DFW hub pricing system
 * @param routeId - The route ID
 * @param tripType - Type of trip (one_way, round_trip)
 * @returns Promise<number> - The calculated fare
 */
export async function calculateFare(routeId: string, tripType: string = 'one_way'): Promise<number> {
  try {
    const route = await RouteModel.findById(routeId)
      .populate('origin', 'name priceToDFW priceFromDFW priceRoundTrip')
      .populate('destination', 'name priceToDFW priceFromDFW priceRoundTrip');

    if (!route) {
      throw new Error('Route not found');
    }

    const origin = route.origin as any;
    const destination = route.destination as any;

    // Check if this is a Dallas route (origin or destination is Dallas)
    const isDallasRoute = isDallasDestination(origin) || isDallasDestination(destination);

    let fare = 0;

    if (isDallasRoute) {
      // Direct Dallas route pricing
      if (isDallasDestination(origin)) {
        // Dallas → X: use priceFromDFW of destination
        fare = destination.priceFromDFW || 0;
      } else {
        // X → Dallas: use priceToDFW of origin
        fare = origin.priceToDFW || 0;
      }
    } else {
      // Derived fare for non-Dallas routes: A → B = priceToDFW(A) + priceFromDFW(B)
      // fare = (origin.priceToDFW || 0) + (destination.priceFromDFW || 0);
      fare = (origin.priceToDFW || 0)
    }

    // Handle round trip pricing
    if (tripType === 'round_trip') {
      fare = origin.priceRoundTrip || 0;
      // if (isDallasRoute) {
      //   // For Dallas routes: round trip = priceFromDFW + priceToDFW
      //   if (isDallasDestination(origin)) {
      //     // Dallas → X round trip = priceFromDFW(X) + priceToDFW(X)
      //     fare = (destination.priceFromDFW || 0) + (destination.priceToDFW || 0);
      //   } else {
      //     // X → Dallas round trip = priceToDFW(X) + priceFromDFW(X)
      //     fare = (origin.priceToDFW || 0) + (origin.priceFromDFW || 0);
      //   }
      // } else {
      //   // For derived routes: round trip = 2 * one-way fare
      //   fare = fare * 2;
      // }
    }

    return fare;
  } catch (error) {
    console.error('Error calculating fare:', error);
    return 0;
  }
}

/**
 * Check if a destination is Dallas
 * @param destination - The destination object
 * @returns boolean
 */
function isDallasDestination(destination: any): boolean {
  if (!destination || !destination.name) return false;
  
  const dallasNames = ['Dallas', 'DFW', 'Dallas-Fort Worth', 'Dallas Fort Worth',"Dallas, TX USA"];
  return dallasNames.some(name => 
    destination.name.toLowerCase().includes(name.toLowerCase())
  );
}

/**
 * Calculate fare for a specific passenger ticket
 * @param passenger - The passenger object with route information
 * @returns Promise<number> - The calculated fare for this passenger
 */
export async function calculatePassengerFare(passenger: any): Promise<number> {
  try {
    // Get the route information from the passenger's bus
    const route = await RouteModel.findOne({ bus: passenger.busId })
      .populate('origin', 'name priceToDFW priceFromDFW')
      .populate('destination', 'name priceToDFW priceFromDFW');

    if (!route) {
      console.error('Route not found for passenger:', passenger._id);
      return 0;
    }

    const origin = route.origin as any;
    const destination = route.destination as any;

    // Check if this is a Dallas route
    const isDallasRoute = isDallasDestination(origin) || isDallasDestination(destination);

    let fare = 0;

    if (isDallasRoute) {
      // Direct Dallas route pricing
      if (isDallasDestination(origin)) {
        // Dallas → X: use priceFromDFW of destination
        fare = destination.priceFromDFW || 0;
      } else {
        // X → Dallas: use priceToDFW of origin
        fare = origin.priceToDFW || 0;
      }
    } else {
      // Derived fare for non-Dallas routes: A → B = priceToDFW(A) + priceFromDFW(B)
      fare = (origin.priceToDFW || 0) + (destination.priceFromDFW || 0);
    }

    return fare;
  } catch (error) {
    console.error('Error calculating passenger fare:', error);
    return 0;
  }
}
