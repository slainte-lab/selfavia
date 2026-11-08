from datetime import date
from typing import Annotated, Literal
import json

from pydantic import BaseModel, Field, model_validator

Airport = Annotated[str, Field(pattern=r'^[A-Z]{3}(,[A-Z]{3})*$', max_length=100)]


class Leg(BaseModel):
    origin: Airport
    destination: Airport
    date: date


class Search(BaseModel):
    mode: Literal['oneway', 'return', 'multi']
    legs: list[Leg] = Field(min_length=1, max_length=6)
    adults: int = Field(ge=1, le=9)
    ages: list[Annotated[int, Field(ge=0, le=17)]] = Field(default_factory=list, max_length=8)
    tokens: list[Annotated[str, Field(min_length=1, max_length=16000)]] = Field(default_factory=list, max_length=5)

    @model_validator(mode='after')
    def validate_route(self):
        n = len(self.legs)
        if self.adults + len(self.ages) > 9 or len(self.tokens) >= n:
            raise ValueError('Invalid passenger or selection count')
        if self.mode == 'oneway' and n != 1 or self.mode == 'multi' and n < 2:
            raise ValueError('Invalid number of legs')
        if self.mode == 'return' and (n != 2 or self.legs[0].origin != self.legs[1].destination
                                      or self.legs[0].destination != self.legs[1].origin):
            raise ValueError('Invalid return route')
        previous = date.today()
        for leg in self.legs:
            if leg.date < previous or leg.origin == leg.destination:
                raise ValueError('Invalid leg')
            previous = leg.date
        return self

    def parameters(self):
        first = self.legs[0]
        params = dict(engine='google_flights', currency='RUB', gl='ru', hl='ru-ru',
                      travel_class=1, show_hidden='true', type={'oneway':2,'return':1,'multi':3}[self.mode],
                      adults=self.adults + sum(age >= 12 for age in self.ages),
                      children=sum(2 <= age < 12 for age in self.ages),
                      infants_in_seat=sum(age < 2 for age in self.ages))
        if self.mode == 'multi':
            params['multi_city_json'] = json.dumps([
                dict(departure_id=leg.origin, arrival_id=leg.destination, date=leg.date.isoformat())
                for leg in self.legs])
        else:
            params.update(departure_id=first.origin, arrival_id=first.destination,
                          outbound_date=first.date.isoformat())
            if self.mode == 'return':
                params['return_date'] = self.legs[1].date.isoformat()
        if self.tokens:
            params['departure_token'] = self.tokens[-1]
        return params
