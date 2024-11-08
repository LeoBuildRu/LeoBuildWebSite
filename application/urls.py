from django.urls import path
from . import views

urlpatterns = [
    path('', views.index_page),
    path('builder/', views.builder_page),
    path('add_to_cart/', views.add_to_cart, name='add_to_cart'),
    path('cart/', views.cart_view, name='cart_view'),
    path('api/compiledJsonProducts/', views.get_products, name='get_products'),
]